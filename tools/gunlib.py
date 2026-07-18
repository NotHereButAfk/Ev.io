"""
Shared Blender (bpy) gun-modeling helpers.

Conventions:
  -Y = muzzle forward, +Z = up, +X = right (glTF export converts to three.js -Z forward).
  Boxes are flat-shaded with crisp chamfer bevels; cylinders/cones smooth-shaded.
  Material NAMES drive the game loader's runtime remap (_buildFromGLB):
    body -> weaponDef.color (furniture)   metal -> steel   dark_metal -> dark parts
    energy -> glowing accents (weaponDef.energyColor)      wood -> brown furniture
  Each finished gun is ONE mesh named weapon_<id> with a muzzle_point empty.
"""
import bpy, math

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_mats():
    def mat(name, rgb, rough=0.5, metal=0.2, emit=None, emit_str=0.0):
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (*rgb, 1)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        if emit is not None:
            b.inputs["Emission Color"].default_value = (*emit, 1)
            b.inputs["Emission Strength"].default_value = emit_str
        return m
    return {
        'body':  mat("body",       (0.85, 0.46, 0.16), 0.55, 0.1),   # orange furniture (runtime: def.color)
        'metal': mat("metal",      (0.45, 0.47, 0.50), 0.32, 0.9),
        'dark':  mat("dark_metal", (0.16, 0.17, 0.19), 0.45, 0.65),
        'wood':  mat("wood",       (0.29, 0.18, 0.09), 0.7, 0.0),
        'energy':mat("energy",     (0.1, 0.5, 0.2), 0.2, 0.1, emit=(0.5, 1.0, 0.25), emit_str=4.0),
    }

class Gun:
    def __init__(self, mats):
        self.parts = []
        self.M = mats

    def _bake(self, o):
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    def box(self, loc, dim, mat, bevel=0.004, seg=1, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        o = bpy.context.active_object
        o.scale = dim
        o.rotation_euler = rot
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        o.data.materials.append(self.M[mat])
        if bevel > 0:
            b = o.modifiers.new("bev", 'BEVEL'); b.width = bevel; b.segments = seg
            b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier="bev")
        self._bake(o); self.parts.append(o); return o

    def cyl(self, loc, r, length, mat, axis='Y', rot=(0, 0, 0), verts=20, r2=None):
        if r2 is None:
            bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length, location=loc, vertices=verts)
        else:
            bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=length, location=loc, vertices=verts)
        o = bpy.context.active_object
        base = {'Y': (math.radians(90), 0, 0), 'X': (0, math.radians(90), 0), 'Z': (0, 0, 0)}[axis]
        o.rotation_euler = tuple(a + b for a, b in zip(base, rot))
        o.data.materials.append(self.M[mat])
        bpy.ops.object.shade_smooth()
        self._bake(o); self.parts.append(o); return o

    def cone(self, loc, r, length, mat, axis='Y', rot=(0, 0, 0), verts=16):
        return self.cyl(loc, r, length, mat, axis=axis, rot=rot, verts=verts, r2=0.0)

    def finish(self, gun_id, muzzle):
        bpy.ops.object.select_all(action='DESELECT')
        for p in self.parts: p.select_set(True)
        bpy.context.view_layer.objects.active = self.parts[0]
        bpy.ops.object.join()
        gun = bpy.context.active_object
        gun.name = f"weapon_{gun_id}"
        bpy.ops.object.empty_add(type='PLAIN_AXES', location=muzzle)
        mz = bpy.context.active_object; mz.name = "muzzle_point"; mz.parent = gun
        self.parts = []
        return gun

def export(path):
    import os
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format='GLB',
                              use_selection=True, export_yup=True, export_apply=True)
    print("EXPORTED", os.path.abspath(path))
