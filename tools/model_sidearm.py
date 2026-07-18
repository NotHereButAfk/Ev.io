"""
Blender (bpy) model script — builds a smooth sci-fi pistol (the Pulse Pistol /
Glock 17) and exports public/sidearm.glb with a node named `weapon_sidearm`.

Materials are named so the game's GLB loader (_buildFromGLB) remaps them:
  body       -> light polymer (weaponDef.color)
  metal      -> steel
  dark_metal -> dark inset / muzzle
  energy     -> glowing cyan accents (weaponDef.energyColor)

Run:  python3 tools/model_sidearm.py
"""
import bpy, bmesh, math, os
from mathutils import Vector

# ── clean slate ────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)

# ── materials (names matter — the loader keys off them) ─────────────────────
def mat(name, rgb, rough=0.5, metal=0.2, emit=None, emit_str=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    r, g, b = rgb
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_str
    return m

M_body = mat("body",       (0.68, 0.66, 0.60), 0.5, 0.25)
M_metal= mat("metal",      (0.42, 0.44, 0.47), 0.3, 0.9)
M_dark = mat("dark_metal", (0.10, 0.11, 0.13), 0.5, 0.6)
M_energy=mat("energy",     (0.05, 0.35, 0.5), 0.2, 0.1, emit=(0.31, 0.83, 1.0), emit_str=4.0)

def _bake(o):
    # bake ALL transforms into the mesh (origin -> world 0,0,0) so geometry is in
    # absolute coords — lets us join everything into one mesh with no per-part
    # transforms to lose on glTF export.
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def _apply_mod(o, name):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=name)

def add_box(name, loc, dim, material, bevel=0.006, seg=3, rot=(0,0,0), smooth=False):
    # boxes are FLAT-shaded with chamfered (beveled) edges -> crisp faceted look
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)   # unit cube (edge 1)
    o = bpy.context.active_object; o.name = name
    o.scale = (dim[0], dim[1], dim[2])                        # edge 1 * dim = full dim
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    o.data.materials.append(material)
    if bevel > 0:
        b = o.modifiers.new("bev", 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40)
        _apply_mod(o, "bev")
    _bake(o)
    return o

def add_cyl(name, loc, r, length, material, axis='Y', rot=(0,0,0), verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length, location=loc, vertices=verts)
    o = bpy.context.active_object; o.name = name
    if axis == 'Y': o.rotation_euler = (math.radians(90), 0, 0)
    elif axis == 'X': o.rotation_euler = (0, math.radians(90), 0)
    o.rotation_euler = tuple(a+b for a,b in zip(o.rotation_euler, rot))
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    _bake(o)
    return o

def add_torus(name, loc, major, minor, material, rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=major, minor_radius=minor,
                                     major_segments=24, minor_segments=10)
    o = bpy.context.active_object; o.name = name
    o.rotation_euler = rot
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    _bake(o)
    return o

parts = []
# Orientation: -Y = muzzle forward, +Z = up, +X = right. (glTF export makes -Y -> -Z forward.)

# ── SLIDE: long block, chamfered top, angled nose ──
slide = add_box("slide", (0, -0.02, 0.075), (0.052, 0.34, 0.055), M_body, bevel=0.010, seg=3); parts.append(slide)
# top rib
parts.append(add_box("rib", (0, -0.02, 0.107), (0.024, 0.30, 0.014), M_body, bevel=0.005))
# angled nose cap
parts.append(add_box("nose", (0, -0.205, 0.070), (0.050, 0.05, 0.050), M_body, bevel=0.010, rot=(math.radians(-12),0,0)))
# ejection port (dark inset) + cutter
parts.append(add_box("ejport", (0.028, -0.06, 0.088), (0.010, 0.075, 0.030), M_dark, bevel=0.003))
# cocking serrations (rear)
for i in range(6):
    parts.append(add_box(f"ser{i}", (0, 0.075 - i*0.016, 0.075), (0.056, 0.006, 0.05), M_dark, bevel=0.001, smooth=False))

# ── FRAME under the slide ──
frame = add_box("frame", (0, -0.03, 0.02), (0.048, 0.30, 0.05), M_body, bevel=0.010, seg=3); parts.append(frame)
# accessory rail underside
parts.append(add_box("rail", (0, -0.13, -0.012), (0.034, 0.12, 0.014), M_dark, bevel=0.002))

# ── GRIP: angled, rounded, sculpted ──
grip = add_box("grip", (0, 0.10, -0.11), (0.05, 0.10, 0.20), M_body, bevel=0.022, seg=4, rot=(math.radians(12),0,0)); parts.append(grip)
parts.append(add_box("magbase", (0, 0.135, -0.215), (0.056, 0.10, 0.02), M_dark, bevel=0.006, rot=(math.radians(12),0,0)))

# ── TRIGGER GUARD: smooth torus loop + trigger ──
parts.append(add_torus("guard", (0, 0.0, -0.03), 0.038, 0.008, M_body, rot=(0, math.radians(90), 0)))
parts.append(add_box("trigger", (0, 0.01, -0.03), (0.012, 0.014, 0.04), M_metal, bevel=0.002))

# ── BARREL + dark muzzle + glowing bore ──
parts.append(add_cyl("barrel", (0, -0.235, 0.070), 0.017, 0.09, M_dark, axis='Y'))
parts.append(add_cyl("bore",   (0, -0.275, 0.070), 0.011, 0.012, M_energy, axis='Y', verts=16))

# ── SIGHTS with glowing dots ──
parts.append(add_box("rsight", (0, 0.10, 0.115), (0.026, 0.016, 0.016), M_dark, bevel=0.003))
parts.append(add_box("fsight", (0, -0.185, 0.115), (0.012, 0.016, 0.016), M_dark, bevel=0.003))
for x in (-0.009, 0.009):
    parts.append(add_box(f"rdot{x}", (x, 0.105, 0.122), (0.005,0.005,0.006), M_energy, bevel=0, smooth=False))
parts.append(add_box("fdot", (0, -0.19, 0.122), (0.006,0.006,0.006), M_energy, bevel=0, smooth=False))

# ── CYAN ACCENTS: frame bolt-slash, grip chevron + charge dashes ──
for sx in (-1, 1):
    parts.append(add_box(f"slash1{sx}", (sx*0.026, 0.00, 0.02), (0.006,0.006,0.03), M_energy, bevel=0, rot=(math.radians(40),0,0), smooth=False))
    parts.append(add_box(f"slash2{sx}", (sx*0.026, 0.03, 0.006), (0.006,0.006,0.026), M_energy, bevel=0, rot=(math.radians(-35),0,0), smooth=False))
    # chevron mid-grip
    parts.append(add_box(f"cvU{sx}", (sx*0.026, 0.075, -0.07), (0.006,0.006,0.03), M_energy, bevel=0, rot=(math.radians(50),0,0), smooth=False))
    parts.append(add_box(f"cvL{sx}", (sx*0.026, 0.10, -0.085), (0.006,0.006,0.03), M_energy, bevel=0, rot=(math.radians(-50),0,0), smooth=False))
    # base charge dashes
    parts.append(add_box(f"dash{sx}", (sx*0.026, 0.14, -0.16), (0.006,0.006,0.03), M_energy, bevel=0, rot=(math.radians(12),0,0), smooth=False))

# ── join all parts into ONE mesh (absolute coords) named weapon_sidearm ──
bpy.ops.object.select_all(action='DESELECT')
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
gun = bpy.context.active_object
gun.name = "weapon_sidearm"

# muzzle empty at the bore, parented to the gun mesh
bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, -0.29, 0.070))
mz = bpy.context.active_object; mz.name = "muzzle_point"; mz.parent = gun

# ── export ──
out = os.path.join(os.path.dirname(__file__), "..", "public", "sidearm.glb")
out = os.path.abspath(out)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True)
print("EXPORTED", out, "verts:", len(gun.data.vertices))
