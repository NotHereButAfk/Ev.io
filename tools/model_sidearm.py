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
# Target: the reference — LONG sleek slide, barrel protruding, ANGULAR trigger
# guard, sharply faceted grip + rear frame, glowing cyan panels. Crisp small
# chamfers (bevel ~0.004, 1-2 segs) so facets stay hard, not pillowy.
ZB = 0.072   # bore line

def bx(name, loc, dim, m, bevel=0.004, seg=1, rot=(0,0,0)):
    parts.append(add_box(name, loc, dim, m, bevel=bevel, seg=seg, rot=rot)); return parts[-1]

# ── SLIDE: long, low, flat-topped with a chamfered nose ──
bx("slide",  (0, -0.02, ZB+0.006), (0.050, 0.40, 0.050), M_body, bevel=0.005, seg=1)
bx("slidetop",(0, -0.02, ZB+0.030), (0.038, 0.40, 0.008), M_body, bevel=0.004)          # flat top plate
bx("nose",   (0, -0.212, ZB), (0.048, 0.045, 0.046), M_body, bevel=0.006, rot=(math.radians(-16),0,0))
bx("ejport", (0.026, -0.05, ZB+0.014), (0.010, 0.075, 0.026), M_dark, bevel=0.002)
for i in range(6):                                                                       # rear serrations
    bx(f"ser{i}", (0, 0.10 - i*0.014, ZB+0.004), (0.054, 0.005, 0.046), M_dark, bevel=0)
for i in range(3):                                                                       # front serrations
    bx(f"fser{i}", (0, -0.15 + i*0.014, ZB+0.004), (0.052, 0.005, 0.044), M_dark, bevel=0)

# ── BARREL protruding past the slide + dark muzzle crown + bore ──
parts.append(add_cyl("barrel", (0, -0.255, ZB), 0.017, 0.09, M_metal, axis='Y'))
parts.append(add_cyl("crown",  (0, -0.298, ZB), 0.021, 0.016, M_dark, axis='Y'))
parts.append(add_cyl("bore",   (0, -0.305, ZB), 0.012, 0.010, M_dark, axis='Y', verts=16))

# ── FRAME: block + faceted rear (beavertail) gem-cut ──
bx("frame",  (0, -0.03, ZB-0.052), (0.044, 0.34, 0.044), M_body, bevel=0.005)
bx("dustcov",(0, -0.15, ZB-0.058), (0.034, 0.14, 0.030), M_dark, bevel=0.003)            # rail block under barrel
bx("beaver", (0, 0.135, ZB-0.028), (0.042, 0.055, 0.060), M_body, bevel=0.006, rot=(math.radians(34),0,0))  # angled beavertail facet
bx("rframe", (0, 0.115, ZB-0.052), (0.044, 0.09, 0.05), M_body, bevel=0.006)             # rear frame hump

# ── ANGULAR TRIGGER GUARD (square-ish loop from beveled bars) + trigger ──
bx("gtop",   (0, -0.055, ZB-0.078), (0.030, 0.10, 0.014), M_body, bevel=0.004)           # top of guard
bx("gfront", (0, -0.10, ZB-0.115), (0.028, 0.014, 0.062), M_body, bevel=0.005, rot=(math.radians(20),0,0)) # angled front strut
bx("gbot",   (0, -0.035, ZB-0.140), (0.028, 0.115, 0.014), M_body, bevel=0.005)          # bottom bar
bx("grear",  (0, 0.028, ZB-0.115), (0.030, 0.016, 0.058), M_body, bevel=0.004)           # rear post into grip
bx("trigger",(0, -0.045, ZB-0.110), (0.012, 0.014, 0.04), M_metal, bevel=0.002)

# ── GRIP: angular block + raised faceted side panels + cyan inset + magwell ──
GR = math.radians(15)
bx("grip",   (0, 0.075, ZB-0.185), (0.046, 0.11, 0.215), M_body, bevel=0.006, rot=(GR,0,0))
bx("gripfront",(0, 0.015, ZB-0.175), (0.040, 0.020, 0.16), M_body, bevel=0.008, rot=(GR,0,0))  # front strap
for sx in (-1, 1):
    bx(f"panel{sx}", (sx*0.024, 0.075, ZB-0.175), (0.012, 0.075, 0.13), M_body, bevel=0.010, rot=(GR,0,0))  # raised bevelled panel
    # cyan glowing inset inside the panel (the reference's grip glow)
    parts.append(add_box(f"glowpanel{sx}", (sx*0.031, 0.075, ZB-0.175), (0.005, 0.045, 0.09), M_energy, bevel=0.004, rot=(GR,0,0)))
bx("magwell",(0, 0.108, ZB-0.295), (0.050, 0.10, 0.022), M_dark, bevel=0.004, rot=(GR,0,0))

# ── SIGHTS with glowing cyan dots ──
bx("rsight", (0, 0.12, ZB+0.040), (0.026, 0.018, 0.016), M_dark, bevel=0.003)
bx("fsight", (0, -0.195, ZB+0.040), (0.012, 0.016, 0.014), M_dark, bevel=0.003)
for x in (-0.009, 0.009):
    parts.append(add_box(f"rdot{x}", (x, 0.125, ZB+0.048), (0.005,0.006,0.006), M_energy, bevel=0))
parts.append(add_box("fdot", (0, -0.20, ZB+0.048), (0.006,0.007,0.006), M_energy, bevel=0))

# ── CYAN LIGHTNING BOLT on each frame flank (Z-shape) + small slide nicks ──
for sx in (-1, 1):
    parts.append(add_box(f"b1{sx}", (sx*0.023, -0.02, ZB-0.030), (0.005,0.006,0.028), M_energy, bevel=0, rot=(math.radians(55),0,0)))
    parts.append(add_box(f"b2{sx}", (sx*0.023, 0.01,  ZB-0.048), (0.005,0.006,0.024), M_energy, bevel=0, rot=(math.radians(-40),0,0)))
    parts.append(add_box(f"b3{sx}", (sx*0.023, 0.045, ZB-0.062), (0.005,0.006,0.022), M_energy, bevel=0, rot=(math.radians(55),0,0)))
# slide front + rear cyan nicks (top edge accents)
parts.append(add_box("nickF", (0, -0.20, ZB+0.032), (0.012,0.004,0.012), M_energy, bevel=0))
parts.append(add_box("nickR", (0, 0.155, ZB+0.028), (0.012,0.004,0.012), M_energy, bevel=0))

# ── join all parts into ONE mesh (absolute coords) named weapon_sidearm ──
bpy.ops.object.select_all(action='DESELECT')
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
gun = bpy.context.active_object
gun.name = "weapon_sidearm"
# normalise to pistol size (the first export came out nearly carbine-length)
S = 0.75
gun.scale = (S, S, S)
bpy.ops.object.select_all(action='DESELECT')
gun.select_set(True); bpy.context.view_layer.objects.active = gun
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# muzzle empty at the bore, parented to the gun mesh
bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, -0.29*S, 0.070*S))
mz = bpy.context.active_object; mz.name = "muzzle_point"; mz.parent = gun

# ── export ──
out = os.path.join(os.path.dirname(__file__), "..", "public", "sidearm.glb")
out = os.path.abspath(out)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True)
print("EXPORTED", out, "verts:", len(gun.data.vertices))
