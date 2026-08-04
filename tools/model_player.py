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

Budget: 92 blocks x 12 = 1104 triangles. The build asserts it stays under 1200.
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
SHOULDER_X, HIP_X = 0.215, 0.105
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
    block("Helm_Crown", A, "Head", (0, -0.005, 1.712), (0.230, 0.255, 0.135),
          top=(0.72, 0.78), top_off=(0, 0.012))
    block("Helm_Face", A, "Head", (0, -0.086, 1.668), (0.212, 0.115, 0.104),
          top=(1.05, 1.0), bot_off=(0, 0.012))
    block("Helm_Nape", D, "Head", (0, 0.094, 1.665), (0.190, 0.090, 0.140),
          top=(0.85, 0.9))
    block("Helm_Jaw", D, "Head", (0, -0.040, 1.586), (0.176, 0.195, 0.058),
          top=(1.12, 1.05))
    # The visor sits proud of the face plate so it catches its own silhouette
    # edge; buried flush it reads as a decal rather than a lens.
    block("Visor", V, "Head", (0, -0.146, 1.670), (0.186, 0.030, 0.050),
          top=(0.92, 1.0))
    block("Helm_Crest", A, "Head", (0, 0.012, 1.788), (0.036, 0.20, 0.036),
          top=(0.45, 0.80))
    mirrored("Helm_Cheek", A, "Head", (0.096, -0.052, 1.640),
             (0.034, 0.130, 0.088), top=(0.8, 0.85))
    block("Neck", D, "Neck", (0, 0.005, 1.545), (0.100, 0.104, 0.075))

    # ── torso: white plate over a recessed dark core ─────────────────────────
    # The core is deliberately NARROWER and set back, not merely darker: a
    # recess is read from the step in the silhouette, and two coplanar slabs in
    # different colours read as paint.
    block("Torso_Core", D, "Chest", (0, 0.005, 1.345), (0.300, 0.225, 0.235))
    mirrored("Chest_Pec", A, "Chest", (0.086, -0.072, 1.385),
             (0.150, 0.140, 0.180), top=(0.95, 0.85), top_off=(0.012, 0.012),
             rot=(0, R(-6), 0))
    block("Chest_Collar", A, "Chest", (0, -0.012, 1.470), (0.290, 0.215, 0.058),
          top=(0.70, 0.80), top_off=(0, 0.015))
    block("Back_Plate", A, "Chest", (0, 0.112, 1.375), (0.265, 0.085, 0.215),
          top=(0.88, 0.85))
    block("Chest_Glow", V, "Chest", (0, -0.130, 1.300), (0.056, 0.024, 0.032))

    # ── abdomen + pelvis ─────────────────────────────────────────────────────
    block("Abdomen_Core", D, "Spine", (0, 0.005, 1.195), (0.230, 0.190, 0.145))
    block("Abdomen_Plate", A, "Spine", (0, -0.072, 1.222), (0.185, 0.075, 0.070),
          top=(1.10, 1.0))
    # Three stacked lames rather than one slab: a segmented belly is the single
    # cheapest thing that says "armour" instead of "torso-shaped box", and each
    # step is a free silhouette break at 12 triangles.
    block("Ab_Lame_Mid", A, "Spine", (0, -0.074, 1.170), (0.176, 0.072, 0.036))
    block("Ab_Lame_Low", A, "Spine", (0, -0.070, 1.130), (0.166, 0.068, 0.034))
    block("Pelvis_Core", D, "Pelvis", (0, 0.005, 1.055), (0.265, 0.205, 0.135))
    block("Belt", D, "Pelvis", (0, 0.005, 1.118), (0.280, 0.220, 0.040))
    mirrored("Hip_Plate", A, "Pelvis", (0.128, -0.020, 1.020),
             (0.080, 0.190, 0.140), top=(1.0, 0.9), bot_off=(0.014, 0),
             rot=(0, R(9), 0))

    # ── pauldrons, offset outboard of the torso so the arm swings under ──────
    mirrored("Pauldron", A, "Clavicle", (0.246, -0.010, 1.448),
             (0.160, 0.235, 0.125), top=(0.78, 0.84), top_off=(-0.014, 0),
             rot=(0, R(14), 0))
    mirrored("Pauldron_Lame", A, "Clavicle", (0.262, -0.008, 1.352),
             (0.150, 0.205, 0.080), top=(0.92, 0.96), top_off=(-0.010, 0),
             rot=(0, R(18), 0))
    mirrored("Pauldron_Glow", V, "Clavicle", (0.318, -0.070, 1.408),
             (0.020, 0.030, 0.050))

    # ── arms: guard over undersuit, joints left bare ─────────────────────────
    mirrored("Bicep_Under", D, "UpperArm", (0.220, 0.0, 1.315),
             (0.120, 0.130, 0.235), top=(0.90, 0.92))
    mirrored("Bicep_Guard", A, "UpperArm", (0.228, -0.026, 1.330),
             (0.128, 0.105, 0.155), top=(0.88, 0.95), bot_off=(0.008, 0))
    mirrored("Forearm_Under", D, "LowerArm", (0.220, 0.0, 1.030),
             (0.104, 0.114, 0.235), top=(1.10, 1.10))
    mirrored("Forearm_Guard", A, "LowerArm", (0.224, -0.020, 1.010),
             (0.126, 0.118, 0.165), top=(0.82, 0.88), bot_off=(0.006, 0))
    mirrored("Hand", D, "LowerArm", (0.220, -0.004, 0.856),
             (0.096, 0.086, 0.115), top=(1.06, 1.08))

    # ── legs ─────────────────────────────────────────────────────────────────
    mirrored("Thigh_Under", D, "Thigh", (0.112, 0.0, 0.760),
             (0.175, 0.195, 0.360), top=(1.10, 1.08))
    mirrored("Thigh_Plate", A, "Thigh", (0.114, -0.070, 0.800),
             (0.180, 0.115, 0.235), top=(0.92, 0.90), top_off=(0.004, -0.008))
    mirrored("Knee", D, "Thigh", (0.112, -0.014, 0.520),
             (0.156, 0.170, 0.090), top=(1.04, 1.02))
    mirrored("Shin_Under", D, "Shin", (0.112, 0.0, 0.315),
             (0.146, 0.160, 0.330), top=(1.04, 1.04))
    mirrored("Shin_Plate", A, "Shin", (0.114, -0.062, 0.330),
             (0.156, 0.105, 0.275), top=(0.86, 0.88))
    mirrored("Shin_Glow", V, "Shin", (0.114, -0.118, 0.430),
             (0.032, 0.022, 0.075))
    # Thick, flat-bottomed sci-fi boot: the block flares DOWNWARD (top scale
    # below 1) so the widest line is the one on the floor.
    mirrored("Boot", A, "Shin", (0.112, -0.022, 0.098),
             (0.182, 0.270, 0.105), top=(0.82, 0.88), top_off=(0, 0.016))
    mirrored("Boot_Sole", D, "Shin", (0.112, -0.022, 0.022),
             (0.190, 0.284, 0.044), top=(0.97, 0.98))

    # ── detail pass ──────────────────────────────────────────────────────────
    # Every one of these is another 12-triangle block. They are placed to break
    # a long unbroken face or to bridge a gap between two parts — detail that
    # sits in the middle of a flat panel costs the same and reads as nothing.

    # helmet: brow over the visor, ear pods, chin vent
    block("Helm_Brow", A, "Head", (0, -0.150, 1.706), (0.196, 0.036, 0.026),
          top=(0.90, 1.0))
    mirrored("Helm_Ear", D, "Head", (0.116, 0.005, 1.672),
             (0.028, 0.090, 0.078), top=(0.85, 0.9))
    block("Helm_Vent", D, "Head", (0, -0.100, 1.566), (0.100, 0.048, 0.026))

    # chest: sternum ridge, collar clamps, vents under the pectorals, and the
    # bolt the pauldron pivots on — that gap between torso and shoulder was
    # reading as a missing part rather than an articulation.
    block("Chest_Sternum", A, "Chest", (0, -0.140, 1.395), (0.052, 0.030, 0.140),
          top=(0.80, 1.0))
    mirrored("Collar_Clamp", D, "Chest", (0.118, -0.030, 1.492),
             (0.052, 0.100, 0.040))
    mirrored("Chest_Vent", D, "Chest", (0.082, -0.118, 1.286),
             (0.086, 0.038, 0.040))
    mirrored("Shoulder_Bolt", D, "Chest", (0.196, -0.004, 1.432),
             (0.060, 0.110, 0.090), top=(0.92, 0.94))

    # back pack — the back was one flat plate from every rear angle
    block("Pack_Main", A, "Chest", (0, 0.176, 1.372), (0.190, 0.080, 0.190),
          top=(0.86, 0.90))
    mirrored("Pack_Vent", D, "Chest", (0.062, 0.212, 1.318), (0.060, 0.036, 0.070))
    mirrored("Pack_Glow", V, "Chest", (0.062, 0.232, 1.318), (0.040, 0.016, 0.048))

    # pelvis
    block("Belt_Buckle", A, "Pelvis", (0, -0.112, 1.118), (0.072, 0.026, 0.050))
    block("Groin_Plate", A, "Pelvis", (0, -0.062, 0.988), (0.110, 0.096, 0.090),
          top=(1.10, 1.0))
    block("Hip_Rear", A, "Pelvis", (0, 0.112, 1.030), (0.180, 0.070, 0.120),
          top=(0.95, 0.95))

    # arms: deltoid under the pauldron, elbow bridging bicep to forearm,
    # cuff at the wrist, knuckles on the hand
    mirrored("Deltoid_Cap", A, "UpperArm", (0.222, -0.006, 1.424),
             (0.126, 0.140, 0.070), top=(0.86, 0.88))
    mirrored("Elbow_Pad", D, "LowerArm", (0.222, -0.012, 1.160),
             (0.122, 0.132, 0.070))
    mirrored("Wrist_Cuff", A, "LowerArm", (0.222, -0.008, 0.928),
             (0.118, 0.108, 0.046))
    mirrored("Knuckle", A, "LowerArm", (0.220, -0.040, 0.878),
             (0.092, 0.030, 0.052))

    # legs: knee cap over the joint, an outboard thigh pod, a calf behind the
    # shin, an ankle collar and a toe cap on the boot
    mirrored("Knee_Cap", A, "Thigh", (0.114, -0.080, 0.520),
             (0.130, 0.070, 0.100), top=(0.90, 0.90))
    mirrored("Thigh_Pod", A, "Thigh", (0.196, -0.010, 0.800),
             (0.048, 0.150, 0.170), top=(0.90, 0.90))
    mirrored("Calf_Plate", A, "Shin", (0.112, 0.082, 0.330),
             (0.130, 0.060, 0.230), top=(0.90, 0.90))
    mirrored("Ankle_Guard", D, "Shin", (0.112, -0.010, 0.168),
             (0.152, 0.170, 0.060))
    mirrored("Boot_Toe", D, "Shin", (0.112, -0.132, 0.062),
             (0.166, 0.056, 0.062), top=(0.95, 0.90))



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
