"""
Models the whole arsenal as real-firearm silhouettes (per the reference chart:
grey steel + furniture (body role -> def.color) + energy accents) and exports
ONE combined public/weapons_authored.glb with a weapon_<id> node per gun.

Run:  python3 tools/model_arsenal.py
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from gunlib import reset, make_mats, Gun, export

reset()
MATS = make_mats()
R = math.radians
Z = 0.07   # shared bore line height

# ── IMI Uzi — stamped box receiver, mag-in-grip, folding stock ─────────────
g = Gun(MATS)
g.box((0, 0.0, Z), (0.055, 0.30, 0.075), 'dark', bevel=0.006)
g.box((0, -0.02, Z+0.042), (0.03, 0.22, 0.012), 'dark')                    # top cover rib
g.box((0, 0.02, Z+0.052), (0.016, 0.03, 0.014), 'metal')                   # cocking knob
g.box((0, 0.03, -0.045), (0.042, 0.055, 0.16), 'body', bevel=0.006)        # grip
g.box((0, 0.03, -0.15), (0.036, 0.045, 0.075), 'metal', bevel=0.003)       # mag protruding
g.box((0, -0.045, -0.055), (0.026, 0.10, 0.012), 'dark')                   # guard bottom
g.box((0, -0.09, -0.02), (0.026, 0.012, 0.06), 'dark')                     # guard front
g.box((0, -0.02, -0.03), (0.010, 0.012, 0.035), 'metal')                   # trigger
g.cyl((0, -0.20, Z), 0.014, 0.10, 'metal')                                  # barrel
g.cyl((0, -0.16, Z), 0.020, 0.03, 'dark')                                   # barrel nut
g.box((0, -0.145, Z+0.045), (0.014, 0.012, 0.022), 'dark')                  # front sight
g.box((0, 0.13, Z+0.042), (0.02, 0.014, 0.018), 'dark')                     # rear sight
g.box((0.024, 0.10, Z+0.01), (0.008, 0.16, 0.010), 'metal', rot=(0,0,R(4))) # folding stock bar R
g.box((-0.024, 0.10, Z+0.01), (0.008, 0.16, 0.010), 'metal', rot=(0,0,R(-4)))
g.box((0, 0.19, Z-0.01), (0.05, 0.018, 0.055), 'metal', bevel=0.004)        # butt plate
g.finish('uzi', (0, -0.26, Z))

# ── Winchester M1887 lever shotgun — long barrel, loop lever, furniture ────
g = Gun(MATS)
g.cyl((0, -0.30, Z+0.02), 0.0145, 0.52, 'metal')                            # barrel
g.cyl((0, -0.26, Z-0.012), 0.011, 0.42, 'metal')                            # mag tube
g.box((0, 0.02, Z), (0.046, 0.17, 0.085), 'dark', bevel=0.006)              # receiver
g.box((0, -0.02, Z+0.052), (0.03, 0.08, 0.012), 'dark')                     # top flat
g.box((0, 0.095, Z+0.02), (0.012, 0.03, 0.03), 'metal', rot=(R(-35),0,0))   # hammer
g.box((0, -0.24, Z-0.012), (0.048, 0.13, 0.045), 'body', bevel=0.012)       # wood forend
g.box((0, 0.20, Z-0.03), (0.044, 0.22, 0.075), 'body', bevel=0.010, rot=(R(14),0,0))  # stock
g.box((0, 0.315, Z-0.065), (0.05, 0.02, 0.085), 'dark', rot=(R(14),0,0))    # butt plate
g.box((0, 0.02, Z-0.075), (0.024, 0.11, 0.012), 'metal')                    # lever top bar
g.box((0, 0.085, Z-0.11), (0.024, 0.012, 0.075), 'metal', rot=(R(15),0,0))  # lever rear drop
g.box((0, -0.035, Z-0.115), (0.024, 0.012, 0.07), 'metal', rot=(R(-12),0,0))# lever front drop
g.box((0, 0.025, Z-0.145), (0.024, 0.10, 0.012), 'metal')                   # loop bottom
g.box((0, -0.01, Z-0.02), (0.010, 0.012, 0.035), 'metal')                   # trigger
g.box((0, -0.545, Z+0.035), (0.010, 0.012, 0.016), 'metal')                 # bead
g.finish('levershotgun', (0, -0.565, Z+0.02))

# ── Colt M4 Carbine ────────────────────────────────────────────────────────
def build_ar(gun_id, blen, hg_len, stock='collapsible', scope=False, carry=False, mag_len=0.10):
    a = Gun(MATS)
    a.box((0, 0.03, Z+0.012), (0.05, 0.20, 0.05), 'dark', bevel=0.005)      # upper
    a.box((0, 0.05, Z-0.032), (0.048, 0.16, 0.045), 'dark', bevel=0.005)    # lower
    a.box((0, 0.03, Z+0.044), (0.03, 0.18, 0.014), 'metal')                 # rail
    a.box((0, -0.13, Z+0.005), (0.052, 0.16 if hg_len < 0.2 else hg_len, 0.055), 'body', bevel=0.010)  # handguard
    a.cyl((0, -0.13, Z+0.038), 0.006, hg_len*0.8, 'metal')                  # gas tube hint
    brl_z = -0.13 - hg_len/2 - blen/2
    a.cyl((0, brl_z, Z+0.005), 0.012, blen, 'metal')                        # barrel
    a.box((0, brl_z + blen/2 - 0.01, Z+0.03), (0.014, 0.02, 0.05), 'dark')  # front sight A-frame
    a.cyl((0, brl_z - blen/2 - 0.02, Z+0.005), 0.016, 0.05, 'dark')         # flash hider
    a.box((0, 0.10, Z-0.075), (0.04, 0.05, 0.09), 'body', bevel=0.008, rot=(R(20),0,0))   # grip
    a.box((0, 0.045, Z-0.10), (0.026, 0.09, 0.012), 'dark')                 # guard
    a.box((0, 0.0, Z-0.075), (0.026, 0.012, 0.05), 'dark')
    a.box((0, 0.012, Z-0.055), (0.010, 0.012, 0.035), 'metal')              # trigger
    a.box((0, -0.02, Z-0.09), (0.036, 0.05, mag_len), 'metal', bevel=0.004, rot=(R(-8),0,0))  # mag
    if stock == 'collapsible':
        a.cyl((0, 0.16, Z+0.005), 0.018, 0.10, 'dark')                      # buffer tube
        a.box((0, 0.235, Z-0.005), (0.046, 0.09, 0.075), 'body', bevel=0.008)  # stock
        a.box((0, 0.285, Z-0.005), (0.05, 0.016, 0.085), 'dark')            # butt pad
    else:
        a.box((0, 0.22, Z-0.02), (0.046, 0.20, 0.08), 'body', bevel=0.010, rot=(R(8),0,0))
        a.box((0, 0.315, Z-0.045), (0.05, 0.02, 0.09), 'dark', rot=(R(8),0,0))
    if carry:
        a.box((0, 0.03, Z+0.062), (0.022, 0.14, 0.022), 'dark', bevel=0.004)   # carry handle
        a.box((0, 0.095, Z+0.078), (0.018, 0.02, 0.014), 'dark')
    if scope:
        a.cyl((0, 0.01, Z+0.075), 0.02, 0.16, 'dark')
        a.cyl((0, -0.07, Z+0.075), 0.026, 0.04, 'dark')                     # objective
        a.cyl((0, 0.09, Z+0.075), 0.022, 0.03, 'dark')                      # ocular
        a.box((0, 0.01, Z+0.052), (0.014, 0.04, 0.02), 'metal')             # mount
    a.box((0, -0.19, Z+0.048), (0.010, 0.010, 0.02), 'metal')               # front post
    return a

g = build_ar('m4', 0.16, 0.16)
g.finish('m4', (0, -0.40, Z+0.005))

# ── Colt M16A2 — long barrel, fixed stock, carry handle ────────────────────
g = build_ar('m16', 0.24, 0.20, stock='fixed', carry=True)
g.finish('m16', (0, -0.50, Z+0.005))

# ── KAC SR-25 (dmr) — long handguard, scope, 20-rd mag ─────────────────────
g = build_ar('dmr', 0.20, 0.26, stock='collapsible', scope=True, mag_len=0.12)
g.finish('dmr', (0, -0.50, Z+0.005))

# ── AK-pattern rifle — sloped receiver, banana mag, wood furniture ─────────
g = Gun(MATS)
g.box((0, 0.02, Z), (0.05, 0.24, 0.06), 'dark', bevel=0.006)                # receiver
g.box((0, -0.005, Z+0.036), (0.044, 0.19, 0.018), 'metal', bevel=0.004)     # dust cover
g.box((0, -0.185, Z+0.02), (0.05, 0.13, 0.045), 'body', bevel=0.010)        # wood upper handguard
g.box((0, -0.185, Z-0.025), (0.052, 0.13, 0.04), 'body', bevel=0.010)       # lower handguard
g.cyl((0, -0.32, Z+0.028), 0.007, 0.16, 'metal')                            # gas tube
g.cyl((0, -0.33, Z+0.002), 0.011, 0.18, 'metal')                            # barrel
g.cyl((0, -0.43, Z+0.002), 0.014, 0.035, 'dark', rot=(R(0),0,0))            # slant brake
g.box((0, -0.415, Z+0.035), (0.012, 0.012, 0.028), 'dark')                  # front sight tower
# banana mag: three angled segments overlapping into one curved sweep
g.box((0, -0.005, Z-0.070), (0.038, 0.052, 0.075), 'metal', bevel=0.004, rot=(R(-12),0,0))
g.box((0, 0.012, Z-0.125), (0.038, 0.052, 0.075), 'metal', bevel=0.004, rot=(R(-32),0,0))
g.box((0, 0.045, Z-0.170), (0.038, 0.052, 0.070), 'metal', bevel=0.004, rot=(R(-52),0,0))
g.box((0, 0.12, Z-0.075), (0.04, 0.05, 0.085), 'body', bevel=0.008, rot=(R(22),0,0))   # grip
g.box((0, 0.06, Z-0.095), (0.026, 0.08, 0.012), 'dark')                     # guard
g.box((0, 0.075, Z-0.06), (0.010, 0.012, 0.035), 'metal')                   # trigger
g.box((0, 0.24, Z-0.02), (0.044, 0.22, 0.07), 'body', bevel=0.012, rot=(R(10),0,0))    # stock
g.box((0, 0.345, Z-0.045), (0.048, 0.02, 0.08), 'dark', rot=(R(10),0,0))    # butt
g.box((0, 0.13, Z+0.045), (0.018, 0.016, 0.02), 'dark')                     # rear sight
g.finish('rifle', (0, -0.46, Z+0.002))

# ── FN M240 LMG — long receiver, bipod, ammo box ───────────────────────────
g = Gun(MATS)
g.box((0, 0.02, Z), (0.055, 0.34, 0.085), 'dark', bevel=0.006)              # receiver
g.box((0, -0.05, Z+0.055), (0.05, 0.20, 0.022), 'metal', bevel=0.004)       # feed cover
g.cyl((0, -0.32, Z+0.01), 0.014, 0.28, 'metal')                             # barrel
g.cyl((0, -0.455, Z+0.01), 0.019, 0.045, 'dark')                            # flash hider
g.box((0, -0.24, Z+0.045), (0.014, 0.05, 0.035), 'dark', rot=(R(50),0,0))   # carry handle
g.box((0.03, -0.36, Z-0.06), (0.008, 0.008, 0.13), 'metal', rot=(0,R(14),0))  # bipod leg R
g.box((-0.03, -0.36, Z-0.06), (0.008, 0.008, 0.13), 'metal', rot=(0,R(-14),0))
g.box((0, 0.09, Z-0.075), (0.04, 0.05, 0.085), 'body', bevel=0.008, rot=(R(20),0,0))   # grip
g.box((0, 0.045, Z-0.095), (0.026, 0.08, 0.012), 'dark')                    # guard
g.box((0, 0.055, Z-0.06), (0.010, 0.012, 0.035), 'metal')                   # trigger
g.box((0, 0.26, Z+0.005), (0.046, 0.14, 0.075), 'body', bevel=0.008)        # stock
g.box((0, 0.33, Z+0.005), (0.05, 0.016, 0.085), 'dark')                     # butt pad
g.box((0.01, 0.0, Z-0.10), (0.06, 0.10, 0.075), 'dark', bevel=0.006)        # ammo box
g.box((0.042, 0.0, Z-0.10), (0.004, 0.07, 0.05), 'energy', bevel=0.002)     # glowing ammo window
g.box((0, -0.13, Z+0.052), (0.012, 0.012, 0.022), 'dark')                   # front sight
g.finish('lmg', (0, -0.48, Z+0.01))

# ── RPG-7 ──────────────────────────────────────────────────────────────────
g = Gun(MATS)
g.cyl((0, 0.05, Z+0.01), 0.028, 0.55, 'dark')                               # main tube
g.cyl((0, 0.36, Z+0.01), 0.032, 0.10, 'dark', r2=0.055)                     # rear flare
g.box((0, -0.02, Z+0.01), (0.075, 0.16, 0.075), 'body', bevel=0.014)        # wood heat shield
g.cyl((0, -0.29, Z+0.01), 0.030, 0.10, 'metal', r2=0.05)                    # warhead taper in
g.cyl((0, -0.38, Z+0.01), 0.05, 0.10, 'metal')                              # warhead bulb
g.cone((0, -0.47, Z+0.01), 0.05, 0.09, 'dark')                              # warhead cone tip
g.box((0, -0.10, Z-0.06), (0.036, 0.045, 0.075), 'body', bevel=0.008, rot=(R(14),0,0))  # front grip
g.box((0, 0.03, Z-0.06), (0.036, 0.045, 0.08), 'body', bevel=0.008, rot=(R(18),0,0))    # rear grip
g.box((0, -0.075, Z-0.035), (0.010, 0.012, 0.03), 'metal')                  # trigger
g.box((0, -0.16, Z+0.06), (0.012, 0.012, 0.03), 'dark')                     # front sight
g.finish('rpg', (0, -0.52, Z+0.01))

# ── AI AWM (boltsniper) — chassis, long barrel, big scope ──────────────────
g = Gun(MATS)
g.box((0, 0.06, Z), (0.05, 0.30, 0.07), 'body', bevel=0.010)                # chassis mid
g.box((0, 0.27, Z-0.005), (0.046, 0.16, 0.085), 'body', bevel=0.010)        # butt block
g.box((0, 0.245, Z+0.048), (0.04, 0.09, 0.02), 'body', bevel=0.006)         # cheek riser
g.box((0, 0.33, Z-0.005), (0.05, 0.016, 0.09), 'dark')                      # butt pad
g.box((0, 0.19, Z-0.045), (0.044, 0.05, 0.03), 'dark', bevel=0.004)         # thumbhole bridge
g.box((0, -0.06, Z+0.012), (0.046, 0.16, 0.055), 'dark', bevel=0.005)       # action
g.cyl((0, -0.34, Z+0.012), 0.012, 0.42, 'metal')                            # barrel
g.box((0, -0.545, Z+0.012), (0.028, 0.05, 0.032), 'dark', bevel=0.004)      # muzzle brake
g.box((0.035, 0.02, Z+0.02), (0.022, 0.014, 0.014), 'metal', rot=(0,R(-30),0))  # bolt handle
g.cyl((0.048, 0.035, Z+0.005), 0.009, 0.025, 'metal', axis='X')             # bolt knob
g.cyl((0, -0.02, Z+0.075), 0.021, 0.20, 'dark')                             # scope tube
g.cyl((0, -0.12, Z+0.075), 0.028, 0.05, 'dark')                             # objective bell
g.cyl((0, 0.08, Z+0.075), 0.024, 0.04, 'dark')                              # ocular
for zy in (-0.05, 0.04):
    g.box((0, zy, Z+0.05), (0.014, 0.03, 0.02), 'metal')                    # rings
g.box((0, 0.02, Z+0.10), (0.012, 0.02, 0.012), 'metal')                     # elevation turret
g.box((0, 0.045, Z-0.065), (0.034, 0.06, 0.05), 'metal', bevel=0.004, rot=(R(-5),0,0))  # mag
g.box((0, 0.12, Z-0.075), (0.038, 0.045, 0.08), 'body', bevel=0.008, rot=(R(18),0,0))   # grip
g.box((0, 0.075, Z-0.09), (0.024, 0.07, 0.012), 'dark')                     # guard
g.box((0, 0.085, Z-0.055), (0.010, 0.012, 0.03), 'metal')                   # trigger
g.finish('boltsniper', (0, -0.575, Z+0.012))

# ── Desert Eagle (magnum) — big slab slide ─────────────────────────────────
g = Gun(MATS)
g.box((0, -0.01, Z+0.02), (0.052, 0.30, 0.06), 'body', bevel=0.006)         # slab slide (body = finish)
g.box((0, -0.01, Z+0.055), (0.032, 0.28, 0.014), 'dark')                    # top rib
for i in range(4):
    g.box((0, 0.10 - i*0.014, Z+0.02), (0.056, 0.005, 0.05), 'dark', bevel=0)  # serrations
g.box((0, -0.15, Z+0.02), (0.05, 0.02, 0.055), 'dark', rot=(R(-20),0,0))    # nose chamfer hint
g.cyl((0, -0.165, Z+0.02), 0.014, 0.02, 'dark')                             # big bore
g.box((0, 0.0, Z-0.03), (0.048, 0.24, 0.045), 'metal', bevel=0.005)         # frame
g.box((0, 0.10, Z-0.095), (0.044, 0.10, 0.16), 'dark', bevel=0.010, rot=(R(16),0,0))   # grip
g.box((0, 0.03, Z-0.09), (0.028, 0.09, 0.012), 'metal')                     # guard bottom
g.box((0, -0.015, Z-0.065), (0.028, 0.012, 0.05), 'metal')                  # guard front
g.box((0, 0.015, Z-0.055), (0.010, 0.012, 0.032), 'metal')                  # trigger
g.box((0, 0.125, Z+0.055), (0.022, 0.014, 0.014), 'dark')                   # rear sight
g.box((0, -0.135, Z+0.055), (0.010, 0.012, 0.012), 'dark')                  # front sight
g.finish('magnum', (0, -0.175, Z+0.02))

# ── H&K G3 (battlerifle) — slim long receiver, fixed stock ─────────────────
g = Gun(MATS)
g.box((0, 0.0, Z), (0.048, 0.30, 0.065), 'dark', bevel=0.006)               # receiver
g.box((0, -0.24, Z-0.005), (0.046, 0.18, 0.05), 'body', bevel=0.010)        # slim handguard
g.cyl((0, -0.40, Z+0.012), 0.011, 0.16, 'metal')                            # barrel
g.cyl((0, -0.485, Z+0.012), 0.014, 0.035, 'dark')                           # flash hider
g.cyl((0, -0.32, Z+0.045), 0.012, 0.02, 'dark', axis='Y')                   # front sight ring base
g.box((0, -0.32, Z+0.062), (0.008, 0.008, 0.02), 'dark')                    # post
g.cyl((0, 0.10, Z+0.048), 0.014, 0.025, 'dark', axis='Z')                   # rear drum sight
g.box((0, 0.02, Z-0.075), (0.036, 0.05, 0.09), 'metal', bevel=0.004, rot=(R(-6),0,0))  # mag
g.box((0, 0.13, Z-0.075), (0.04, 0.05, 0.085), 'body', bevel=0.008, rot=(R(20),0,0))   # grip
g.box((0, 0.075, Z-0.095), (0.026, 0.08, 0.012), 'dark')                    # guard
g.box((0, 0.09, Z-0.06), (0.010, 0.012, 0.035), 'metal')                    # trigger
g.box((0, 0.26, Z-0.01), (0.044, 0.20, 0.07), 'body', bevel=0.010, rot=(R(6),0,0))     # stock
g.box((0, 0.355, Z-0.025), (0.048, 0.02, 0.08), 'dark', rot=(R(6),0,0))     # butt
g.finish('battlerifle', (0, -0.505, Z+0.012))

# ── FN P90 (needler) — bullpup shell, top mag, thumbhole ───────────────────
g = Gun(MATS)
g.box((0, 0.09, Z-0.01), (0.055, 0.30, 0.10), 'body', bevel=0.018)          # rear bullpup shell
g.box((0, -0.10, Z+0.006), (0.052, 0.14, 0.075), 'dark', bevel=0.012)       # front shell
g.box((0, 0.0, Z+0.052), (0.044, 0.34, 0.024), 'metal', bevel=0.006)        # top magazine slab
g.box((0, 0.0, Z+0.068), (0.03, 0.30, 0.008), 'energy', bevel=0.003)        # glowing rounds strip
g.cyl((0, -0.20, Z+0.012), 0.012, 0.06, 'metal')                            # stub barrel
g.cyl((0, -0.225, Z+0.012), 0.016, 0.025, 'dark')                           # shroud ring
g.box((0, -0.07, Z-0.062), (0.04, 0.045, 0.055), 'body', bevel=0.010, rot=(R(12),0,0))  # front grip hump
g.box((0, 0.02, Z-0.075), (0.026, 0.10, 0.012), 'dark')                     # guard bar
g.box((0, -0.015, Z-0.05), (0.010, 0.012, 0.03), 'metal')                   # trigger
g.box((0, 0.075, Z-0.068), (0.04, 0.05, 0.05), 'body', bevel=0.010)         # rear grip block
g.box((0, 0.235, Z-0.005), (0.05, 0.016, 0.095), 'dark')                    # butt plate
g.box((0, 0.05, Z+0.085), (0.012, 0.05, 0.012), 'dark')                     # sight block
g.finish('needler', (0, -0.245, Z+0.012))

# ── Remington 870 (energyshotgun) ──────────────────────────────────────────
g = Gun(MATS)
g.box((0, 0.03, Z), (0.048, 0.16, 0.07), 'dark', bevel=0.006)               # receiver
g.cyl((0, -0.27, Z+0.018), 0.0135, 0.44, 'metal')                           # barrel
g.cyl((0, -0.24, Z-0.018), 0.011, 0.36, 'metal')                            # mag tube
g.box((0, -0.19, Z-0.018), (0.05, 0.11, 0.042), 'body', bevel=0.012)        # pump
for i in range(4):
    g.box((0, -0.155 - i*0.024, Z-0.043), (0.052, 0.006, 0.008), 'dark', bevel=0)  # pump grooves
g.box((0, 0.19, Z-0.02), (0.044, 0.22, 0.075), 'body', bevel=0.012, rot=(R(12),0,0))   # stock
g.box((0, 0.295, Z-0.048), (0.048, 0.02, 0.085), 'dark', rot=(R(12),0,0))   # recoil pad
g.box((0, 0.075, Z-0.075), (0.026, 0.08, 0.012), 'dark')                    # guard
g.box((0, 0.085, Z-0.045), (0.010, 0.012, 0.03), 'metal')                   # trigger
g.box((0, -0.485, Z+0.042), (0.008, 0.008, 0.012), 'energy')                # glowing bead
g.finish('energyshotgun', (0, -0.50, Z+0.018))

# ── M79 (fuelrod) — break-action fat tube, wood furniture ──────────────────
g = Gun(MATS)
g.cyl((0, -0.17, Z+0.01), 0.033, 0.36, 'metal')                             # fat barrel
g.cyl((0, -0.355, Z+0.01), 0.037, 0.025, 'dark')                            # muzzle ring
g.box((0, 0.05, Z+0.005), (0.05, 0.10, 0.075), 'dark', bevel=0.006)         # receiver block
g.box((0, -0.15, Z-0.035), (0.055, 0.22, 0.03), 'body', bevel=0.012)        # wood forend under barrel
g.box((0, 0.20, Z-0.025), (0.046, 0.24, 0.075), 'body', bevel=0.012, rot=(R(13),0,0))  # stock
g.box((0, 0.315, Z-0.055), (0.05, 0.02, 0.085), 'dark', rot=(R(13),0,0))    # butt pad
g.box((0, 0.055, Z-0.075), (0.026, 0.08, 0.012), 'dark')                    # guard
g.box((0, 0.065, Z-0.045), (0.010, 0.012, 0.03), 'metal')                   # trigger
g.box((0, -0.30, Z+0.055), (0.014, 0.014, 0.035), 'dark')                   # big ladder sight
g.box((0, 0.09, Z+0.048), (0.016, 0.012, 0.016), 'dark')                    # rear sight
g.finish('fuelrod', (0, -0.375, Z+0.01))

# ── Combat knife (knife) — crystal blade + guard + handle ──────────────────
g = Gun(MATS)
g.box((0, -0.13, Z), (0.008, 0.20, 0.038), 'energy', bevel=0.004)           # crystal blade body
g.cone((0, -0.26, Z+0.004), 0.019, 0.07, 'energy', rot=(0,R(45),0), verts=4) # tip
g.box((0, -0.10, Z+0.024), (0.006, 0.14, 0.010), 'metal')                   # spine
g.box((0, -0.025, Z), (0.026, 0.018, 0.055), 'metal', bevel=0.004)          # guard
g.box((0, 0.045, Z), (0.024, 0.13, 0.036), 'body', bevel=0.010)             # handle
for i in range(3):
    g.box((0, 0.01 + i*0.032, Z), (0.027, 0.008, 0.038), 'dark', bevel=0)   # handle rings
g.box((0, 0.115, Z), (0.028, 0.02, 0.04), 'dark', bevel=0.004)              # pommel
g.finish('knife', (0, -0.30, Z))

export(os.path.join(os.path.dirname(__file__), "..", "public", "weapons_authored.glb"))
