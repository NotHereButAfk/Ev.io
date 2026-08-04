"""
Builds an ev.io-style hero character — white armour over a black undersuit with
a glowing yellow visor — entirely from primitives, rigs it, and saves a .blend.

Run:
    blender --background --python tools/model_player.py
    blender --background --python tools/model_player.py -- --out /path/out.blend
    blender --background --python tools/model_player.py -- --glb   (also write a .glb)

or, with the `bpy` pip module installed:
    python3 tools/model_player.py

Axes follow the rest of tools/ (see gunlib.py): +Z up, character faces -Y, so
the glTF exporter's Z-up→Y-up conversion lands the model facing glTF-forward
without a fix-up rotation. That also means +X is the character's LEFT, which is
what Blender's .L/.R naming and its mirror tools assume.

EVERY part is a tapered box: eight explicit corners, six quads, twelve
triangles. A taper costs nothing over a cube and is the whole difference
between sci-fi plate and a stack of shoeboxes — a pauldron that narrows toward
the arm and a boot that flares toward the floor read as designed hardware at
the same triangle count. Nothing is smooth-shaded, nothing is textured, and
the silhouette does all the work.

Budget: 53 blocks x 12 = 636 triangles. The build asserts it stays under 1200.
"""

import os
import sys
import math

import bpy
from mathutils import Euler, Vector

# ── the figure ───────────────────────────────────────────────────────────────
# One table of landmark heights so the mesh and the skeleton are built off the
# same numbers instead of two sets that drift apart. Metres, 1.80m stature.
ANKLE_Z, KNEE_Z, HIP_Z = 0.09, 0.50, 0.96
WAIST_Z, CHEST_Z = 1.10, 1.32
SHOULDER_Z, NECK_Z, CHIN_Z, CROWN_Z = 1.47, 1.53, 1.59, 1.80
SHOULDER_X, HIP_X = 0.20, 0.10
ELBOW_Z, WRIST_Z = 1.16, 0.90

TRI_BUDGET = 1200


# ── materials ────────────────────────────────────────────────────────────────
def make_materials():
    """Three flat materials, no textures, no image nodes.

    `diffuse_color` is set as well as the Principled inputs: Solid viewport
    shading reads that, not the node tree, so without it the whole character is
    default grey until you switch to Material Preview.
    """
    def mat(name, rgb, rough, *, emit=None, emit_strength=0.0):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = 0.0
        if emit is not None:
            # Renamed in Blender 4.0; support both so the script is not pinned
            # to one release.
            col = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
            col.default_value = (*emit, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emit_strength
        m.diffuse_color = (*rgb, 1.0)        # Solid-mode viewport colour
        m.roughness = rough
        m.use_backface_culling = False       # standard: draw both sides
        return m

    return {
        "armor": mat("HERO_Armor_White", (0.92, 0.92, 0.94), 0.4),
        "dark":  mat("HERO_Undersuit_Charcoal", (0.055, 0.058, 0.065), 0.8),
        "visor": mat("HERO_Visor_Emissive", (0.95, 0.78, 0.12), 0.25,
                     emit=(1.0, 0.82, 0.10), emit_strength=5.0),
    }


# ── geometry ─────────────────────────────────────────────────────────────────
PARTS = []          # (object, bone_name)


def block(name, material, bone, at, size,
          top=(1.0, 1.0), top_off=(0.0, 0.0), bot_off=(0.0, 0.0), rot=None):
    """A tapered box: 8 verts, 6 quads, 12 triangles.

    at        centre of the block
    size      full extents (x, y, z) measured at the BOTTOM face
    top       (x, y) scale of the top face relative to the bottom — the taper
    top_off   / bot_off   lateral shift of each face, for a leaning slab
    rot       Euler XYZ about the block's own centre
    """
    cx, cy, cz = at
    hx, hy, hz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
    tx, ty = hx * top[0], hy * top[1]

    bx, by = bot_off
    ux, uy = top_off
    verts = [
        (bx - hx, by - hy, -hz), (bx + hx, by - hy, -hz),
        (bx + hx, by + hy, -hz), (bx - hx, by + hy, -hz),
        (ux - tx, uy - ty,  hz), (ux + tx, uy - ty,  hz),
        (ux + tx, uy + ty,  hz), (ux - tx, uy + ty,  hz),
    ]
    faces = [
        (0, 3, 2, 1),           # -Z
        (4, 5, 6, 7),           # +Z
        (0, 1, 5, 4),           # -Y  (front, the way the character faces)
        (1, 2, 6, 5),           # +X
        (2, 3, 7, 6),           # +Y
        (3, 0, 4, 7),           # -X
    ]

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    for poly in mesh.polygons:              # flat shading, explicitly
        poly.use_smooth = False
    mesh.materials.append(material)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if rot:
        obj.rotation_euler = Euler(rot, 'XYZ')
    obj.location = (cx, cy, cz)
    PARTS.append((obj, bone))
    return obj


def sided_bones():
    """The bone names that exist per-side, e.g. {'Clavicle', 'Thigh', …}."""
    return {n[:-2] for n, *_ in BONES if n.endswith(".L")}


def mirrored(name, material, bone, at, size, **kw):
    """Build the same block on both sides.

    `bone` gets .L / .R appended ONLY if that bone is actually sided. A left
    and a right pectoral both ride the single `Chest` bone, and so do the helm
    cheeks on `Head` and the hip plates on `Pelvis` — suffixing those asks for
    `Chest.L`, which does not exist.

    Mirroring is also not just a negated x: a rotation that tilts a pauldron
    outward on one side tilts it inward on the other unless its Y and Z
    components flip too.
    """
    two_sided = bone in sided_bones()
    for side, s in (("L", 1.0), ("R", -1.0)):
        k = dict(kw)
        if "rot" in k and k["rot"]:
            rx, ry, rz = k["rot"]
            k["rot"] = (rx, ry * s, rz * s)
        for key in ("top_off", "bot_off"):
            if key in k and k[key]:
                k[key] = (k[key][0] * s, k[key][1])
        block(f"{name}.{side}", material,
              f"{bone}.{side}" if two_sided else bone,
              (at[0] * s, at[1], at[2]), size, **k)


def build_mesh(M):
    A, D, V = M["armor"], M["dark"], M["visor"]
    R = math.radians

    # ── head: a segmented helm with the visor let into the front plate ───────
    block("Helm_Crown", A, "Head", (0, -0.005, 1.715), (0.215, 0.235, 0.13),
          top=(0.72, 0.78), top_off=(0, 0.012))
    block("Helm_Face", A, "Head", (0, -0.075, 1.665), (0.20, 0.10, 0.10),
          top=(1.05, 1.0), bot_off=(0, 0.012))
    block("Helm_Nape", D, "Head", (0, 0.085, 1.665), (0.175, 0.075, 0.135),
          top=(0.85, 0.9))
    block("Helm_Jaw", D, "Head", (0, -0.035, 1.588), (0.165, 0.175, 0.055),
          top=(1.12, 1.05))
    # The visor sits proud of the face plate so it catches its own silhouette
    # edge; buried flush it reads as a decal rather than a lens.
    block("Visor", V, "Head", (0, -0.126, 1.668), (0.176, 0.030, 0.046),
          top=(0.92, 1.0))
    block("Helm_Crest", A, "Head", (0, 0.012, 1.788), (0.036, 0.20, 0.036),
          top=(0.45, 0.80))
    mirrored("Helm_Cheek", A, "Head", (0.088, -0.045, 1.640),
             (0.030, 0.115, 0.085), top=(0.8, 0.85))
    block("Neck", D, "Neck", (0, 0.005, 1.545), (0.088, 0.092, 0.075))

    # ── torso: white plate over a recessed dark core ─────────────────────────
    # The core is deliberately NARROWER and set back, not merely darker: a
    # recess is read from the step in the silhouette, and two coplanar slabs in
    # different colours read as paint.
    block("Torso_Core", D, "Chest", (0, 0.005, 1.345), (0.255, 0.175, 0.235))
    mirrored("Chest_Pec", A, "Chest", (0.078, -0.055, 1.385),
             (0.135, 0.105, 0.175), top=(0.95, 0.85), top_off=(0.012, 0.010),
             rot=(0, R(-7), 0))
    block("Chest_Collar", A, "Chest", (0, -0.012, 1.470), (0.245, 0.170, 0.055),
          top=(0.70, 0.80), top_off=(0, 0.015))
    block("Back_Plate", A, "Chest", (0, 0.088, 1.375), (0.225, 0.070, 0.215),
          top=(0.88, 0.85))
    block("Chest_Glow", V, "Chest", (0, -0.108, 1.300), (0.052, 0.022, 0.030))

    # ── abdomen + pelvis ─────────────────────────────────────────────────────
    block("Abdomen_Core", D, "Spine", (0, 0.005, 1.195), (0.195, 0.150, 0.145))
    block("Abdomen_Plate", A, "Spine", (0, -0.055, 1.180), (0.155, 0.065, 0.105),
          top=(1.10, 1.0))
    block("Pelvis_Core", D, "Pelvis", (0, 0.005, 1.055), (0.225, 0.165, 0.135))
    block("Belt", D, "Pelvis", (0, 0.005, 1.118), (0.238, 0.178, 0.038))
    mirrored("Hip_Plate", A, "Pelvis", (0.108, -0.020, 1.020),
             (0.070, 0.150, 0.135), top=(1.0, 0.9), bot_off=(0.014, 0),
             rot=(0, R(9), 0))

    # ── pauldrons, offset outboard of the torso so the arm swings under ──────
    mirrored("Pauldron", A, "Clavicle", (0.223, -0.010, 1.452),
             (0.135, 0.185, 0.115), top=(0.80, 0.85), bot_off=(0.020, 0),
             rot=(0, R(-13), 0))
    mirrored("Pauldron_Lame", A, "Clavicle", (0.232, -0.008, 1.360),
             (0.120, 0.160, 0.075), top=(1.05, 1.05), bot_off=(0.014, 0),
             rot=(0, R(-16), 0))
    mirrored("Pauldron_Glow", V, "Clavicle", (0.288, -0.052, 1.408),
             (0.018, 0.026, 0.046))

    # ── arms: guard over undersuit, joints left bare ─────────────────────────
    mirrored("Bicep_Under", D, "UpperArm", (0.205, 0.0, 1.315),
             (0.092, 0.098, 0.235), top=(0.90, 0.92))
    mirrored("Bicep_Guard", A, "UpperArm", (0.212, -0.018, 1.330),
             (0.098, 0.070, 0.150), top=(0.88, 0.95), bot_off=(0.008, 0))
    mirrored("Forearm_Under", D, "LowerArm", (0.205, 0.0, 1.030),
             (0.080, 0.086, 0.235), top=(1.10, 1.10))
    mirrored("Forearm_Guard", A, "LowerArm", (0.208, -0.012, 1.010),
             (0.098, 0.082, 0.160), top=(0.82, 0.88), bot_off=(0.006, 0))
    mirrored("Hand", D, "LowerArm", (0.205, 0.0, 0.862),
             (0.072, 0.062, 0.105), top=(1.08, 1.10))

    # ── legs ─────────────────────────────────────────────────────────────────
    mirrored("Thigh_Under", D, "Thigh", (0.104, 0.0, 0.760),
             (0.135, 0.145, 0.360), top=(1.12, 1.10))
    mirrored("Thigh_Plate", A, "Thigh", (0.106, -0.048, 0.800),
             (0.140, 0.085, 0.230), top=(0.92, 0.90), top_off=(0.004, -0.006))
    mirrored("Knee", D, "Thigh", (0.104, -0.012, 0.520),
             (0.118, 0.128, 0.090), top=(1.05, 1.02))
    mirrored("Shin_Under", D, "Shin", (0.104, 0.0, 0.315),
             (0.110, 0.118, 0.330), top=(1.05, 1.05))
    mirrored("Shin_Plate", A, "Shin", (0.104, -0.042, 0.330),
             (0.120, 0.078, 0.270), top=(0.85, 0.88))
    mirrored("Shin_Glow", V, "Shin", (0.104, -0.086, 0.430),
             (0.030, 0.020, 0.070))
    # Thick, flat-bottomed sci-fi boot: the block flares DOWNWARD (top scale
    # below 1) so the widest line is the one on the floor.
    mirrored("Boot", A, "Shin", (0.104, -0.028, 0.098),
             (0.150, 0.255, 0.105), top=(0.80, 0.86), top_off=(0, 0.016))
    mirrored("Boot_Sole", D, "Shin", (0.104, -0.028, 0.022),
             (0.158, 0.268, 0.044), top=(0.97, 0.98))


# ── armature ─────────────────────────────────────────────────────────────────
#           name          head                       tail                      parent      connected
BONES = [
    ("Root",       (0, 0, 0.0),                (0, 0, 0.16),               None,        False),
    ("Pelvis",     (0, 0, HIP_Z),              (0, 0, WAIST_Z),            "Root",      False),
    ("Spine",      (0, 0, WAIST_Z),            (0, 0, 1.235),              "Pelvis",    True),
    ("Chest",      (0, 0, 1.235),              (0, 0, NECK_Z),             "Spine",     True),
    ("Neck",       (0, 0, NECK_Z),             (0, 0, CHIN_Z),             "Chest",     True),
    ("Head",       (0, 0, CHIN_Z),             (0, 0, CROWN_Z),            "Neck",      True),
    ("Clavicle.L", (0.035, 0, 1.442),          (SHOULDER_X, 0, SHOULDER_Z), "Chest",    False),
    ("UpperArm.L", (SHOULDER_X, 0, SHOULDER_Z), (SHOULDER_X, 0, ELBOW_Z),  "Clavicle.L", True),
    ("LowerArm.L", (SHOULDER_X, 0, ELBOW_Z),   (SHOULDER_X, 0, WRIST_Z),   "UpperArm.L", True),
    ("Thigh.L",    (HIP_X, 0, HIP_Z),          (HIP_X, 0, KNEE_Z),         "Pelvis",    False),
    ("Shin.L",     (HIP_X, 0, KNEE_Z),         (HIP_X, 0, ANKLE_Z),        "Thigh.L",   True),
]


def build_armature():
    arm_data = bpy.data.armatures.new("HeroRig")
    arm = bpy.data.objects.new("HeroRig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    arm.show_in_front = True
    # mode_set polls the ACTIVE object, and some builds want it selected too.
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def add(name, head, tail, parent, connect):
        b = arm_data.edit_bones.new(name)
        b.head, b.tail, b.roll = Vector(head), Vector(tail), 0.0
        if parent:
            b.parent = arm_data.edit_bones[parent]
            b.use_connect = connect
        return b

    for name, head, tail, parent, connect in BONES:
        add(name, head, tail, parent, connect)
        if name.endswith(".L"):          # mirror the whole arm/leg chain
            mx = lambda v: (-v[0], v[1], v[2])
            add(name[:-2] + ".R", mx(head), mx(tail),
                parent[:-2] + ".R" if parent and parent.endswith(".L") else parent,
                connect)

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def parent_to_bones(arm):
    """Rigid BONE parenting, one plate to one bone.

    Automatic Weights is the other option the brief allows, and it is the wrong
    one here: it needs a single skinned mesh, and it would smoothly blend rigid
    armour plates across joints — a shin plate would bend at the knee. These
    parts are hard surfaces, so each is parented outright to the bone it rides.

    Blender parents to a bone's TAIL, so the object jumps unless the transform
    is compensated. Re-assigning matrix_world after the parent is set does that
    without hand-building the inverse matrix.
    """
    for obj, bone_name in PARTS:
        if bone_name not in arm.data.bones:
            raise KeyError(f"{obj.name} wants bone {bone_name!r}, which does not exist")
        keep = obj.matrix_world.copy()
        obj.parent = arm
        obj.parent_type = 'BONE'
        obj.parent_bone = bone_name
        obj.matrix_world = keep


# ── scene ────────────────────────────────────────────────────────────────────
def set_viewport_shading():
    """Material Preview where there is a UI; a no-op under --background."""
    for window in getattr(bpy.context.window_manager, "windows", []):
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                for space in area.spaces:
                    if space.type == 'VIEW_3D':
                        space.shading.type = 'MATERIAL'
                        space.shading.use_scene_lights = True


def count_triangles():
    total = 0
    for obj, _ in PARTS:
        if hasattr(obj.data, "calc_loop_triangles"):   # removed from 4.1's API path
            obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def script_args():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def main():
    args = script_args()
    out = os.path.abspath("ev_io_player_model.blend")
    if "--out" in args:
        out = os.path.abspath(args[args.index("--out") + 1])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    PARTS.clear()

    mats = make_materials()
    build_mesh(mats)
    arm = build_armature()
    parent_to_bones(arm)

    tris = count_triangles()
    print(f"[hero] {len(PARTS)} parts, {tris} triangles")
    if tris >= TRI_BUDGET:
        raise SystemExit(f"[hero] over budget: {tris} >= {TRI_BUDGET} triangles")

    set_viewport_shading()
    bpy.context.view_layer.objects.active = arm

    bpy.ops.wm.save_as_mainfile(filepath=out)
    print(f"[hero] wrote {out}")

    if "--glb" in args:
        glb = os.path.splitext(out)[0] + ".glb"
        bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB',
                                  export_apply=True)
        print(f"[hero] wrote {glb}")


if __name__ == "__main__":
    main()
