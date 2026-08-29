"""Build the production KYX arena-warrior with Blender.

The base is the project's licensed Universal Animation Library mannequin and
armature.  This script keeps its continuous skinned human body, renames the
deform bones to the runtime's Mixamo-compatible contract, authors a compact
layered arena-warrior shell, keeps a focused set of gameplay clips, exports a
GLB, saves the editable .blend, and renders three review views.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "vendor" / "quaternius" / "universal-animation-library.glb"
OUT_GLB = ROOT / "public" / "kyx-player.glb"
OUT_DIR = ROOT / "artifacts" / "kyx-player"
OUT_BLEND = OUT_DIR / "kyx-warrior.blend"
OUT_DIR.mkdir(parents=True, exist_ok=True)
BODY_SOURCE = None


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)
    # Interactive reruns otherwise suffix every imported action with .001 and
    # leave the exporter with duplicate clips from the previous build.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def material(name, color, metallic=0.0, roughness=0.6, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        strength_input = bsdf.inputs.get("Emission Strength")
        if emission_input:
            emission_input.default_value = (*emission, 1.0)
        if strength_input:
            strength_input.default_value = emission_strength
    return mat


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def smooth(obj):
    if obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True


def apply_bevel(obj, amount=0.012, segments=3):
    if obj.type != "MESH" or amount <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new("Soft milled edges", "BEVEL")
    mod.width = amount
    mod.segments = segments
    mod.limit_method = "ANGLE"
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except RuntimeError:
        pass
    obj.select_set(False)


def mark(obj, collection, export=True):
    obj["kyx_authored"] = True
    obj["kyx_export"] = bool(export)
    obj["kyx_collection"] = collection
    return obj


def rounded_box(name, loc, dims, mat, bevel=0.014, rot=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_material(obj, mat)
    apply_bevel(obj, min(bevel, min(dims) * 0.23), 3)
    smooth(obj)
    return mark(obj, "armor")


def ellipsoid(name, loc, dims, mat, rot=(0.0, 0.0, 0.0), segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_material(obj, mat)
    smooth(obj)
    obj.select_set(False)
    return mark(obj, "armor")


def frustum(name, loc, width_top, width_bottom, height, depth, mat, bevel=0.014):
    z0, z1 = -height * 0.5, height * 0.5
    yt, yf = depth * 0.5, -depth * 0.5
    verts = [
        (-width_bottom * 0.5, yf, z0), (width_bottom * 0.5, yf, z0),
        (width_top * 0.5, yf, z1), (-width_top * 0.5, yf, z1),
        (-width_bottom * 0.5, yt, z0), (width_bottom * 0.5, yt, z0),
        (width_top * 0.5, yt, z1), (-width_top * 0.5, yt, z1),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2),
    ]
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    set_material(obj, mat)
    apply_bevel(obj, min(bevel, depth * 0.25), 3)
    smooth(obj)
    return mark(obj, "armor")


def bone_world(armature, bone_name, factor=0.5):
    bone = armature.data.bones.get(bone_name)
    if not bone:
        raise KeyError(f"Missing rig bone: {bone_name}")
    # Bone.head/tail are parent-local in object mode. Authoring needs the full
    # armature-space locations so every limb and helmet piece lands on-body.
    local = bone.head_local.lerp(bone.tail_local, factor)
    return armature.matrix_world @ local


def bone_vector(armature, bone_name):
    bone = armature.data.bones[bone_name]
    return (armature.matrix_world.to_3x3() @ (bone.tail_local - bone.head_local)).normalized()


def parent_to_bone(obj, armature, bone_name):
    # Bake authored transforms before transferring the mannequin's nearby skin
    # weights. Nearest-surface weights keep plates attached to the continuous
    # body through hips, knees, shoulders and the curved running poses instead
    # of turning every plate into a disconnected single-bone robot segment.
    # `transform_apply(location=True)` resets generated primitive locations in
    # Blender 5 without preserving their intended world-space vertex offset.
    # Bake the complete matrix into the mesh explicitly instead.
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    if BODY_SOURCE is not None:
        transfer = obj.modifiers.new("KYX Skin Weights", "DATA_TRANSFER")
        transfer.object = BODY_SOURCE
        transfer.use_vert_data = True
        transfer.data_types_verts = {"VGROUP_WEIGHTS"}
        transfer.vert_mapping = "POLYINTERP_NEAREST"
        transfer.layers_vgroup_select_src = "ALL"
        transfer.layers_vgroup_select_dst = "NAME"
        bpy.ops.object.modifier_apply(modifier=transfer.name)

    # Distant accessories (for example the outer backpack face) may have no
    # transferable group. Keep a deterministic rigid fallback for those.
    if not obj.vertex_groups:
        group = obj.vertex_groups.new(name=bone_name)
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("KYX Rig", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    obj.matrix_parent_inverse = armature.matrix_world.inverted()


def align_long_axis(obj, direction):
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")


def limb_shell(name, armature, bone_name, radius_x, radius_y, length_ratio, mat, front_offset=0.0):
    bone = armature.data.bones[bone_name]
    length = bone.length * length_ratio
    loc = bone_world(armature, bone_name, 0.5) + Vector((0.0, -front_offset, 0.0))
    obj = ellipsoid(name, loc, (radius_x * 2, radius_y * 2, length), mat, segments=20, rings=10)
    align_long_axis(obj, bone_vector(armature, bone_name))
    parent_to_bone(obj, armature, bone_name)
    return obj


def rename_rig(armature):
    mapping = {
        "root": "mixamorigRoot",
        "DEF-hips": "mixamorigHips",
        "DEF-spine.001": "mixamorigSpine",
        "DEF-spine.002": "mixamorigSpine1",
        "DEF-spine.003": "mixamorigSpine2",
        "DEF-neck": "mixamorigNeck",
        "DEF-head": "mixamorigHead",
        "DEF-shoulder.L": "mixamorigLeftShoulder",
        "DEF-upper_arm.L": "mixamorigLeftArm",
        "DEF-forearm.L": "mixamorigLeftForeArm",
        "DEF-hand.L": "mixamorigLeftHand",
        "DEF-shoulder.R": "mixamorigRightShoulder",
        "DEF-upper_arm.R": "mixamorigRightArm",
        "DEF-forearm.R": "mixamorigRightForeArm",
        "DEF-hand.R": "mixamorigRightHand",
        "DEF-thigh.L": "mixamorigLeftUpLeg",
        "DEF-shin.L": "mixamorigLeftLeg",
        "DEF-foot.L": "mixamorigLeftFoot",
        "DEF-toe.L": "mixamorigLeftToeBase",
        "DEF-thigh.R": "mixamorigRightUpLeg",
        "DEF-shin.R": "mixamorigRightLeg",
        "DEF-foot.R": "mixamorigRightFoot",
        "DEF-toe.R": "mixamorigRightToeBase",
    }
    for old, new in mapping.items():
        bone = armature.data.bones.get(old)
        if bone:
            bone.name = new
    # Keep finger articulation available to future reload/fire clips.
    for side, long_side in (("L", "Left"), ("R", "Right")):
        for finger, long_finger in (("index", "Index"), ("middle", "Middle"), ("ring", "Ring"), ("pinky", "Pinky"), ("thumb", "Thumb")):
            for index in (1, 2, 3):
                old = f"DEF-f_{finger}.{index:02d}.{side}" if finger != "thumb" else f"DEF-thumb.{index:02d}.{side}"
                bone = armature.data.bones.get(old)
                if bone:
                    bone.name = f"mixamorig{long_side}Hand{long_finger}{index}"


def keep_game_actions():
    aliases = {
        "A_TPose": "TPose",
        "Idle_Loop": "Idle",
        "Walk_Loop": "Walk",
        "Sprint_Loop": "Run",
        "Crouch_Idle_Loop": "CrouchIdle",
        "Crouch_Fwd_Loop": "CrouchWalk",
        "Jump_Start": "JumpStart",
        "Jump_Loop": "JumpLoop",
        "Jump_Land": "JumpLand",
        "Pistol_Shoot": "Fire",
        "Pistol_Reload": "Reload",
        "Sword_Idle": "SwordIdle",
        "Sword_Attack": "SwordAttack",
        "Death01": "Death",
    }
    for action in list(bpy.data.actions):
        if action.name in aliases:
            action.name = aliases[action.name]
        else:
            bpy.data.actions.remove(action)
    return sorted(action.name for action in bpy.data.actions)


def character_bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi


clear_scene()
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
if armature is None:
    raise RuntimeError("Universal animation GLB imported without an armature")
armature.name = "KYX_Warrior_Rig"
armature.data.name = "KYX_Warrior_Skeleton"
armature["kyx_authored_armor"] = True
armature["kyx_character_version"] = 2
mark(armature, "rig")

armature.data.pose_position = "REST"
# Exclude Blender's hidden Icosphere bone-shape helper. Including it made the
# measured height 2.83m instead of the actual 1.83m mannequin and inflated all
# authored armor by roughly 57 percent.
body_objects = [
    obj for obj in bpy.context.scene.objects
    if obj.type == "MESH"
    and obj.name != "Icosphere"
    and any(mod.type == "ARMATURE" and mod.object == armature for mod in obj.modifiers)
]
if not body_objects:
    raise RuntimeError("No skinned mannequin mesh was imported")
BODY_SOURCE = body_objects[0]
for obj in body_objects:
    obj.name = "KYX_Undersuit_" + obj.name
    mark(obj, "body")

rename_rig(armature)
actions = keep_game_actions()

undersuit = material("KYX_Undersuit", (0.026, 0.033, 0.043), metallic=0.05, roughness=0.78)
armor = material("KYX_Armor", (0.16, 0.20, 0.24), metallic=0.52, roughness=0.31)
armor_dark = material("KYX_ArmorDark", (0.035, 0.048, 0.065), metallic=0.38, roughness=0.44)
accent = material("KYX_Orange", (0.94, 0.29, 0.035), metallic=0.28, roughness=0.32,
                  emission=(0.48, 0.07, 0.005), emission_strength=0.22)
visor = material("KYX_Visor", (0.015, 0.34, 0.42), metallic=0.22, roughness=0.18,
                 emission=(0.02, 0.74, 0.92), emission_strength=3.2)

for obj in body_objects:
    set_material(obj, undersuit)
    smooth(obj)

lo, hi = character_bounds(body_objects)
height = hi.z - lo.z
scale = height / 1.80 if height > 0.5 else 1.0
cx = (lo.x + hi.x) * 0.5
cy = (lo.y + hi.y) * 0.5
z0 = lo.z


def S(value):
    return value * scale


def P(x, y, z):
    return (cx + S(x), cy + S(y), z0 + S(z))


pieces = []


def add(obj, bone):
    parent_to_bone(obj, armature, bone)
    pieces.append(obj)
    return obj


# Torso: narrow waist, broad upper breastplate, layered flexible abdomen.
pieces.append(add(frustum("KYX_CoreVest", P(0, 0.025, 1.22), S(0.37), S(0.285), S(0.37), S(0.17), armor_dark, S(0.018)), "mixamorigSpine2"))
for side in (-1, 1):
    plate = frustum(f"KYX_Chest_{'L' if side < 0 else 'R'}", P(0.074 * side, -0.089, 1.33),
                    S(0.142), S(0.118), S(0.175), S(0.038), armor, S(0.009))
    plate.rotation_euler[2] = math.radians(7.0 * side)
    pieces.append(add(plate, "mixamorigSpine2"))
pieces.append(add(frustum("KYX_Sternum", P(0, -0.128, 1.25), S(0.058), S(0.04), S(0.26), S(0.032), armor_dark, S(0.008)), "mixamorigSpine2"))
pieces.append(add(rounded_box("KYX_ChestSignal", P(0, -0.149, 1.32), (S(0.018), S(0.010), S(0.145)), accent, S(0.003)), "mixamorigSpine2"))
for idx, z in enumerate((1.08, 1.00, 0.93)):
    width = 0.255 - idx * 0.018
    pieces.append(add(rounded_box(f"KYX_AbBand_{idx+1}", P(0, -0.067, z),
                                  (S(width), S(0.072), S(0.048)), armor_dark, S(0.010)), "mixamorigSpine1"))
pieces.append(add(rounded_box("KYX_Belt", P(0, 0.0, 0.865), (S(0.32), S(0.17), S(0.068)), armor_dark, S(0.012)), "mixamorigSpine"))
pieces.append(add(frustum("KYX_Buckle", P(0, -0.132, 0.865), S(0.10), S(0.085), S(0.08), S(0.035), armor, S(0.008)), "mixamorigSpine"))

# Backpack/spine gives the warrior silhouette readable depth without bulk.
pieces.append(add(rounded_box("KYX_Backpack", P(0, 0.135, 1.23), (S(0.215), S(0.085), S(0.30)), armor_dark, S(0.019)), "mixamorigSpine2"))
pieces.append(add(rounded_box("KYX_BackSpineLight", P(0, 0.225, 1.27), (S(0.035), S(0.015), S(0.245)), visor, S(0.006)), "mixamorigSpine2"))
for side in (-1, 1):
    pieces.append(add(rounded_box(f"KYX_BackRail_{side}", P(0.085 * side, 0.225, 1.24),
                                  (S(0.038), S(0.02), S(0.24)), armor, S(0.007)), "mixamorigSpine2"))

# Helmet: smooth hood shell, hard crown, narrow luminous visor, jaw armor.
head_center = bone_world(armature, "mixamorigHead", 0.62)
hood = ellipsoid("KYX_HelmetHood", head_center + Vector((0, S(0.012), S(0.015))),
                 (S(0.285), S(0.245), S(0.325)), armor_dark, segments=28, rings=16)
pieces.append(add(hood, "mixamorigHead"))
pieces.append(add(ellipsoid("KYX_HelmetShell", head_center + Vector((0, S(-0.015), S(0.035))),
                            (S(0.255), S(0.218), S(0.29)), armor, segments=28, rings=16), "mixamorigHead"))
pieces.append(add(rounded_box("KYX_Visor", head_center + Vector((0, S(-0.132), S(0.03))),
                              (S(0.225), S(0.032), S(0.075)), visor, S(0.012)), "mixamorigHead"))
pieces.append(add(frustum("KYX_Brow", head_center + Vector((0, S(-0.125), S(0.10))),
                          S(0.23), S(0.19), S(0.065), S(0.045), armor_dark, S(0.01)), "mixamorigHead"))
for side in (-1, 1):
    pieces.append(add(rounded_box(f"KYX_Jaw_{side}", head_center + Vector((S(0.105 * side), S(-0.095), S(-0.075))),
                                  (S(0.065), S(0.075), S(0.145)), armor, S(0.014),
                                  rot=(0, math.radians(8 * side), math.radians(-4 * side))), "mixamorigHead"))
pieces.append(add(rounded_box("KYX_Mask", head_center + Vector((0, S(-0.135), S(-0.085))),
                              (S(0.105), S(0.04), S(0.105)), armor_dark, S(0.012)), "mixamorigHead"))
pieces.append(add(rounded_box("KYX_Crown", head_center + Vector((0, S(0.005), S(0.19))),
                              (S(0.115), S(0.18), S(0.035)), accent, S(0.008)), "mixamorigHead"))

# Shoulders, arms and gauntlets remain compact so a shouldered rifle clears them.
for side, label in ((-1, "Left"), (1, "Right")):
    shoulder_bone = f"mixamorig{label}Shoulder"
    upper_bone = f"mixamorig{label}Arm"
    fore_bone = f"mixamorig{label}ForeArm"
    shoulder = ellipsoid(f"KYX_Shoulder_{label}", bone_world(armature, upper_bone, 0.08) + Vector((S(0.025 * side), 0, 0)),
                         (S(0.145), S(0.12), S(0.115)), armor, segments=20, rings=10)
    pieces.append(add(shoulder, shoulder_bone))
    pieces.append(limb_shell(f"KYX_Bicep_{label}", armature, upper_bone, S(0.040), S(0.037), 0.45, armor_dark))
    pieces.append(limb_shell(f"KYX_Gauntlet_{label}", armature, fore_bone, S(0.047), S(0.043), 0.50, armor))

# Human leg silhouette: thin tactical guards over the continuous skinned legs.
# Flat front guards keep knees and calves anatomical instead of spherical robot
# joints while remaining readable at arena distance.
for side, label in ((-1, "Left"), (1, "Right")):
    thigh = f"mixamorig{label}UpLeg"
    shin = f"mixamorig{label}Leg"
    foot = f"mixamorig{label}Foot"
    thigh_mid = bone_world(armature, thigh, 0.46)
    thigh_guard = rounded_box(f"KYX_ThighGuard_{label}", thigh_mid + Vector((0, S(-0.075), 0)),
                              (S(0.105), S(0.032), S(0.22)), armor, S(0.012))
    align_long_axis(thigh_guard, bone_vector(armature, thigh))
    pieces.append(add(thigh_guard, thigh))
    knee_loc = bone_world(armature, shin, 0.02) + Vector((0, S(-0.065), 0))
    knee = rounded_box(f"KYX_Knee_{label}", knee_loc, (S(0.09), S(0.036), S(0.07)), armor, S(0.014))
    pieces.append(add(knee, shin))
    shin_mid = bone_world(armature, shin, 0.53)
    shin_guard = rounded_box(f"KYX_ShinGuard_{label}", shin_mid + Vector((0, S(-0.074), 0)),
                             (S(0.095), S(0.034), S(0.225)), armor, S(0.014))
    align_long_axis(shin_guard, bone_vector(armature, shin))
    pieces.append(add(shin_guard, shin))
    foot_loc = bone_world(armature, foot, 0.55) + Vector((0, S(-0.035), S(-0.012)))
    pieces.append(add(rounded_box(f"KYX_BootPlate_{label}", foot_loc + Vector((0, S(-0.06), S(0.045))),
                                  (S(0.105), S(0.135), S(0.024)), armor, S(0.007)), foot))

# Side hip plates and a short front tab read as warrior kit instead of robot hips.
for side in (-1, 1):
    hip = rounded_box(f"KYX_Hip_{side}", P(0.18 * side, 0.0, 0.82),
                      (S(0.070), S(0.12), S(0.155)), armor, S(0.014), rot=(0, math.radians(7 * side), 0))
    pieces.append(add(hip, "mixamorigHips"))
pieces.append(add(frustum("KYX_WaistTab", P(0, -0.115, 0.79), S(0.135), S(0.09), S(0.17), S(0.035), armor_dark, S(0.010)), "mixamorigHips"))
pieces.append(add(rounded_box("KYX_WaistMark", P(0, -0.158, 0.80), (S(0.035), S(0.012), S(0.13)), accent, S(0.003)), "mixamorigHips"))

# Export only the production character hierarchy.
for obj in bpy.context.scene.objects:
    obj.select_set(bool(obj.get("kyx_export")))
bpy.context.view_layer.objects.active = armature

bpy.ops.export_scene.gltf(
    filepath=str(OUT_GLB),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_extras=True,
)

# Put the idle clip on the review render when Blender exposes it as an action.
idle = bpy.data.actions.get("Idle")
armature.data.pose_position = "POSE"
if idle:
    armature.animation_data_create()
    try:
        armature.animation_data.action = idle
    except (RuntimeError, TypeError):
        pass
bpy.context.scene.frame_set(1)

# Review studio. These helpers are deliberately added after the GLB export.
floor_mat = material("PreviewFloor", (0.012, 0.016, 0.025), metallic=0.0, roughness=0.82)
bpy.ops.mesh.primitive_plane_add(size=S(12), location=(cx, cy, z0 - S(0.01)))
floor = bpy.context.object
floor.name = "PREVIEW_Floor"
set_material(floor, floor_mat)
mark(floor, "preview", export=False)

world = bpy.context.scene.world or bpy.data.worlds.new("KYX Preview World")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.007, 0.014, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.20


def add_area(name, loc, energy, color, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    point_camera(obj, Vector((cx, cy, z0 + S(1.05))))
    mark(obj, "preview", export=False)
    return obj


def point_camera(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


add_area("PREVIEW_Key", (cx - S(2.7), cy - S(3.3), z0 + S(4.2)), 1050, (0.68, 0.82, 1.0), S(3.0))
add_area("PREVIEW_Fill", (cx + S(3.0), cy - S(2.2), z0 + S(2.2)), 720, (1.0, 0.33, 0.12), S(2.4))
add_area("PREVIEW_Rim", (cx, cy + S(3.2), z0 + S(3.5)), 980, (0.05, 0.65, 1.0), S(2.2))

cam_data = bpy.data.cameras.new("PREVIEW_Camera")
cam = bpy.data.objects.new("PREVIEW_Camera", cam_data)
bpy.context.collection.objects.link(cam)
cam.data.lens = 72
cam.data.sensor_width = 36
bpy.context.scene.camera = cam
mark(cam, "preview", export=False)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 560
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
scene.render.resolution_percentage = 100

target = Vector((cx, cy, z0 + S(1.02)))
views = {
    "front": Vector((cx, cy - S(4.0), z0 + S(1.13))),
    "quarter": Vector((cx + S(2.75), cy - S(3.55), z0 + S(1.20))),
    "side": Vector((cx + S(4.15), cy, z0 + S(1.15))),
}
for name, location in views.items():
    cam.location = location
    point_camera(cam, target)
    scene.render.filepath = str(OUT_DIR / f"kyx-warrior-{name}.png")
    bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))

for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and obj.get("kyx_export"):
        obj.data.calc_loop_triangles()

report = {
    "source": str(SOURCE),
    "glb": str(OUT_GLB),
    "blend": str(OUT_BLEND),
    "height": round(height, 4),
    "actions": actions,
    "armorPieces": len(pieces),
    "bones": len(armature.data.bones),
    "triangles": sum(len(obj.data.loop_triangles) for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.get("kyx_export")),
}
(OUT_DIR / "build-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("KYX_WARRIOR_BUILD_COMPLETE", json.dumps(report))
