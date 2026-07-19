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
# Orientation: -Y = muzzle forward, +Z = up, +X = right.
# Reference-chart Glock 17: COMPACT proportions, GREY slide with neon-green
# glowing slide windows + top stripe, ORANGE grip (body role -> def.color),
# angular trigger guard. Crisp chamfers.
ZB = 0.072   # bore line

def bx(name, loc, dim, m, bevel=0.004, seg=1, rot=(0,0,0)):
    parts.append(add_box(name, loc, dim, m, bevel=bevel, seg=seg, rot=rot)); return parts[-1]

# ── SLIDE: compact grey block, flat top, short nose chamfer ──
bx("slide",  (0, -0.015, ZB+0.006), (0.050, 0.30, 0.052), M_dark, bevel=0.005)
bx("slidetop",(0, -0.015, ZB+0.031), (0.036, 0.28, 0.008), M_dark, bevel=0.003)
bx("nose",   (0, -0.155, ZB+0.002), (0.048, 0.035, 0.046), M_dark, bevel=0.006, rot=(math.radians(-14),0,0))
bx("ejport", (0.0255, -0.03, ZB+0.014), (0.006, 0.07, 0.024), M_metal, bevel=0.002)
for i in range(5):                                                   # rear serrations — GREEN bars (chart)
    bx(f"ser{i}", (0, 0.085 - i*0.014, ZB+0.004), (0.053, 0.006, 0.044), M_energy, bevel=0)
# chart front-top detail: three SLANTED green slashes + a long thin stripe
for i in range(3):
    for sx in (-1, 1):
        parts.append(add_box(f"slash{sx}{i}", (sx*0.0252, -0.115 + i*0.024, ZB+0.016),
                             (0.004, 0.010, 0.030), M_energy, bevel=0, rot=(math.radians(28),0,0)))
for sx in (-1, 1):
    parts.append(add_box(f"stripe{sx}", (sx*0.0252, 0.0, ZB+0.024), (0.004, 0.13, 0.007), M_energy, bevel=0))
parts.append(add_box("topstripe", (0, -0.05, ZB+0.036), (0.010, 0.14, 0.005), M_energy, bevel=0))
# small green square above the trigger (chart)
for sx in (-1, 1):
    parts.append(add_box(f"sq{sx}", (sx*0.0252, -0.045, ZB-0.012), (0.004, 0.013, 0.013), M_energy, bevel=0))
# ORANGE slanted block on the lower slide flank (chart)
for sx in (-1, 1):
    parts.append(add_box(f"lock{sx}", (sx*0.0252, -0.095, ZB-0.010),
                         (0.004, 0.05, 0.022), M_body, bevel=0.002, rot=(math.radians(20),0,0)))
# muzzle + glowing bore
parts.append(add_cyl("crown", (0, -0.176, ZB+0.002), 0.017, 0.014, M_metal, axis='Y'))
parts.append(add_cyl("bore",  (0, -0.183, ZB+0.002), 0.010, 0.008, M_energy, axis='Y', verts=14))

# ── FRAME: grey steel block + rail ──
bx("frame",  (0, -0.02, ZB-0.040), (0.044, 0.28, 0.048), M_dark, bevel=0.005)    # same grey as the slide (chart look)
bx("rail",   (0, -0.12, ZB-0.070), (0.034, 0.10, 0.016), M_dark, bevel=0.003)
parts.append(add_cyl("pin", (0, 0.02, ZB-0.045), 0.0035, 0.048, M_dark, axis='X'))

# ── GRIP: orange (body), Glock rake, finger grooves + backstrap + magwell ──
GR = math.radians(14)
bx("grip",   (0, 0.072, ZB-0.148), (0.046, 0.10, 0.165), M_body, bevel=0.010, seg=2, rot=(GR,0,0))
bx("gripfront",(0, 0.022, ZB-0.140), (0.040, 0.022, 0.13), M_body, bevel=0.010, rot=(GR,0,0))
for i in range(3):                                                   # finger grooves
    bx(f"fg{i}", (0, 0.012 + i*0.005, ZB-0.105 - i*0.033), (0.042, 0.010, 0.008), M_dark, bevel=0, rot=(GR,0,0))
bx("beaver", (0, 0.125, ZB-0.075), (0.044, 0.05, 0.035), M_body, bevel=0.008, rot=(math.radians(30),0,0))
bx("magwell",(0, 0.100, ZB-0.230), (0.048, 0.095, 0.020), M_dark, bevel=0.004, rot=(GR,0,0))
# stipple texture dots on the grip sides
for sx in (-1, 1):
    for i in range(3):
        bx(f"st{sx}{i}", (sx*0.0235, 0.062 + i*0.022, ZB-0.145 - i*0.005), (0.002, 0.012, 0.045), M_dark, bevel=0, rot=(GR,0,0))

# ── ANGULAR TRIGGER GUARD (grey, like the chart) + trigger ──
bx("gtop",   (0, -0.045, ZB-0.070), (0.028, 0.09, 0.012), M_dark, bevel=0.004)
bx("gfront", (0, -0.085, ZB-0.100), (0.026, 0.014, 0.055), M_dark, bevel=0.005, rot=(math.radians(18),0,0))
bx("gbot",   (0, -0.028, ZB-0.122), (0.026, 0.105, 0.012), M_dark, bevel=0.005)
bx("grear",  (0, 0.024, ZB-0.100), (0.028, 0.014, 0.050), M_dark, bevel=0.004)
bx("trigger",(0, -0.038, ZB-0.090), (0.011, 0.013, 0.044), M_metal, bevel=0.002)

# ── SIGHTS with green dots ──
bx("rsight", (0, 0.115, ZB+0.038), (0.024, 0.016, 0.014), M_dark, bevel=0.003)
bx("fsight", (0, -0.14, ZB+0.038), (0.010, 0.014, 0.012), M_dark, bevel=0.003)
for x in (-0.008, 0.008):
    parts.append(add_box(f"rdot{x}", (x, 0.12, ZB+0.046), (0.004,0.005,0.005), M_energy, bevel=0))
parts.append(add_box("fdot", (0, -0.144, ZB+0.045), (0.005,0.006,0.005), M_energy, bevel=0))

# ── connectivity audit: BVH face-overlap (real contact), not AABB proximity ──
def _audit(parts, eps=0.0008):
    from mathutils.bvhtree import BVHTree
    def bb(o):
        xs=[v[0] for v in o.bound_box]; ys=[v[1] for v in o.bound_box]; zs=[v[2] for v in o.bound_box]
        return (min(xs),max(xs),min(ys),max(ys),min(zs),max(zs))
    def tree(o):
        bm=bmesh.new(); bm.from_mesh(o.data)
        t=BVHTree.FromBMesh(bm, epsilon=eps); bm.free()
        return t
    boxes=[bb(o) for o in parts]; trees=[tree(o) for o in parts]; n=len(boxes)
    m=eps*2
    near=lambda a,b:(a[0]-m<=b[1] and b[0]-m<=a[1] and a[2]-m<=b[3] and b[2]-m<=a[3] and a[4]-m<=b[5] and b[4]-m<=a[5])
    inside=lambda a,b:(a[0]>=b[0]-m and a[1]<=b[1]+m and a[2]>=b[2]-m and a[3]<=b[3]+m and a[4]>=b[4]-m and a[5]<=b[5]+m)
    par=list(range(n))
    def find(i):
        while par[i]!=i: par[i]=par[par[i]]; i=par[i]
        return i
    for i in range(n):
        for j in range(i+1,n):
            if not near(boxes[i],boxes[j]): continue
            if inside(boxes[i],boxes[j]) or inside(boxes[j],boxes[i]) or trees[i].overlap(trees[j]):
                par[find(i)]=find(j)
    comps={}
    for i in range(n): comps.setdefault(find(i),[]).append(i)
    main=max(comps.values(),key=len)
    for comp in comps.values():
        if comp is main: continue
        for i in comp:
            b=boxes[i]; c=(round((b[0]+b[1])/2,3),round((b[2]+b[3])/2,3),round((b[4]+b[5])/2,3))
            print(f"FLOATING [sidearm]: {parts[i].name} center={c}")
    if len(comps)==1: print(f"AUDIT OK [sidearm]: {n} parts, 1 component")
_audit(parts)

# ── join all parts into ONE mesh (absolute coords) named weapon_sidearm ──
bpy.ops.object.select_all(action='DESELECT')
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
gun = bpy.context.active_object
gun.name = "weapon_sidearm"
# normalise to pistol size (the first export came out nearly carbine-length)
S = 0.92
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
