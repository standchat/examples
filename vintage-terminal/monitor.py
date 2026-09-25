"""
monitor.py - procedural "80-25 Monochrome Data Display", a fictional 1983 CRT data terminal.

The source of monitor.glb. It builds the whole model from an empty factory scene in headless
Blender (5.2+), bakes a texture atlas for the housing (base colour, tangent-space normal, ORM)
with Cycles, and exports monitor.glb (glTF 2.0 binary, +Y up, WebP textures) next to this
script. The bake intermediates, the textures and monitor.blend go to a work directory.
Optionally renders studio preview images there too. About a minute on a recent Mac.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python monitor.py -- [options]

Options:
  --render           also render preview_corner/front/side/back.png
  --views LIST       comma separated subset of: corner,front,side,back
  --no-bake          skip baking/export (previews use the procedural materials directly)
  --samples N        preview render samples (default 256)
  --res WxH          preview resolution (default 1200x900)
  --tex N            atlas resolution (default 2048)
  --out DIR          where monitor.glb goes (default: the directory of this script)
  --work DIR         intermediates, textures, monitor.blend and previews (default: a temp dir)

Conventions (Blender space): metres, Z up, the screen faces -Y, the origin is the bottom
centre of the pedestal on the desk plane.  glTF export converts to +Y up (screen faces +Z).

All geometry is generated analytically: every rounded part is a "loft" of rounded-rectangle
rings or a lathe, and every vertex gets the exact normal of the ideal smooth surface as a
custom split normal, so modest segment counts still shade perfectly smooth.

Public domain, like the rest of this repository. It uses only Blender built-ins and fonts.
"""

import argparse
import math
import os
import random
import sys
import tempfile
import time
import warnings
from math import cos, pi, sin, sqrt

import bmesh
import bpy
import numpy as np

warnings.filterwarnings("ignore", category=DeprecationWarning)

HERE = os.path.dirname(os.path.abspath(__file__))
T_START = time.time()


def log(*a):
    print("[monitor %6.1fs]" % (time.time() - T_START), *a, flush=True)


# =============================================================================
# Dimensions (metres).  Front = -Y, up = +Z.
# =============================================================================
# front section / bezel outline (front view)
HW, HH = 0.200, 0.175          # half width / half height of the front section
Z0 = 0.055                     # underside of the housing (sits on the pedestal)
ZC = Z0 + HH                   # centre height of the front outline
R_OUT = 0.032                  # corner radius of the front outline
YF = -0.170                    # bezel front plane
R_FE = 0.016                   # outer front edge fillet
Y_GROOVE = YF + 0.045          # parting line between bezel and rear housing
R_G, GAP = 0.0012, 0.0010      # parting line lip radius, gap
STEP = 0.0022                  # rear housing is slightly smaller than the bezel
# rear bell
Y_K, DK = -0.020, 0.030        # knee where the bell starts to taper, blend half width
YB, R_B, D2 = 0.230, 0.022, 0.020
HW_B, ZT_B, ZB_B, R_BK = 0.135, 0.325, 0.068, 0.048   # rear outline (half width, top, bottom, radius)
Y2 = YB - R_B - D2             # end of the linear taper
# vents
Y_V0, Y_V1, E_V, VENT_D = 0.048, 0.160, 0.0022, 0.0055
N_TOP_SLOTS, N_SIDE_SLOTS, SLOT_PITCH, SLOT_W, SLOT_WALL = 11, 7, 0.0115, 0.0052, 0.0009
# screen
OW, OH, OR = 0.296, 0.222, 0.016   # visible 4:3 glass opening, corner radius
FW = 0.015                         # width of the charcoal funnel (mouth = opening + FW)
R_LIP = 0.004                      # beige rounded lip around the funnel mouth
TOP_BORDER = 0.028                 # outline top -> funnel mouth top
ZO = Z0 + 2 * HH - TOP_BORDER - OH / 2 - FW   # opening centre height
RS = 1.1                           # CRT glass sphere radius
Y_GLASS = YF + 0.012               # glass apex
GW, GH = 0.312, 0.234              # glass mesh size (4:3, tucks behind the surround)
GNX, GNY = 48, 36                  # glass grid
Y_MOUTH = YF + 0.006               # where the charcoal funnel emerges behind the lip
# chin controls
Z_CTRL = 0.1005
KNOB_B_X, KNOB_C_X = 0.0525, 0.0935
KNOB_R, KNOB_SKIRT_R, KNOB_H = 0.0145, 0.0170, 0.0190
LED_X, BTN_X = 0.1295, 0.1590
BADGE_X, BADGE_Z = -0.118, 0.0990
BTN_HALF, BTN_R, BTN_OUT, BTN_DEPTH = 0.0120, 0.0035, 0.0060, 0.012
# pedestal
FOOT = (0.140, 0.120, 0.070, 0.0, 0.0)   # rounded rect (hw, hd, r, cx, cy)
NECK = (0.086, 0.058, 0.034, 0.0, 0.0)
FOOT_H, R_BB, R_FT, R_NF = 0.020, 0.003, 0.0085, 0.006

SEED = 1983

# Colours (sRGB 0..255)
BEIGE = (205, 196, 172)
CHARCOAL = (38, 35, 32)
POSTIT = (246, 197, 16)


def glass_y(x, z):
    """Front surface of the CRT glass (sphere) at (x, z)."""
    return Y_GLASS + RS - sqrt(max(RS * RS - x * x - (z - ZO) ** 2, 0.0))


# =============================================================================
# Small math helpers
# =============================================================================
def lerp(a, b, u):
    return a + (b - a) * u


def smoothstep(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3.0 - 2.0 * u)


def v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def v_norm(a):
    l = sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
    if l < 1e-20:
        return (0.0, 0.0, 1.0)
    return (a[0] / l, a[1] / l, a[2] / l)


def soft_pw(y, y1, y2, v0, v1, d1, d2):
    """C1 profile: v0 before y1, linear to v1 at y2, then constant; the two kinks are
    replaced by parabolic blends of half width d1 / d2."""
    m = (v1 - v0) / (y2 - y1)
    if y <= y1 - d1:
        return v0
    if y < y1 + d1:
        return v0 + m * (y - y1 + d1) ** 2 / (4 * d1)
    if y <= y2 - d2:
        return v0 + m * (y - y1)
    if y < y2 + d2:
        return v1 - m * (y2 + d2 - y) ** 2 / (4 * d2)
    return v1


def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(c255):
    return tuple(srgb_to_lin(v) for v in c255) + (1.0,)


# =============================================================================
# Rounded rectangle rings
# =============================================================================
# A rounded rectangle is (hw, hh, r, ca, cb): half extents, corner radius and centre in the
# ring plane (a = right, b = up).  A ring vertex "spec" says where on the outline it sits:
#   (segment, kind, value[, tag]) with segments in counter-clockwise order starting at the
#   bottom middle (seam).  Corners use kind 'c' (angle fraction), sides use
#   'f' fraction of the side, 'a' absolute offset from the side middle, or
#   'g' (fraction, g, which) = fraction of [start, -g] (which=0) or [+g, end] (which=1).
B_P, BR, R_, TR, T_, TL, L_, BL, B_M = range(9)
CORNERS = {BR: (-0.5 * pi, 1, -1), TR: (0.0, 1, 1), TL: (0.5 * pi, -1, 1), BL: (pi, -1, -1)}


def rr_off(rr, d):
    """Offset a rounded rectangle outward by d (negative = inset)."""
    return (rr[0] + d, rr[1] + d, rr[2] + d, rr[3], rr[4])


def rr_in(rr, d, rmin=0.0004):
    """Inset by d but keep a minimum corner radius (for flat inner rings of caps)."""
    return (rr[0] - d, rr[1] - d, max(rr[2] - d, rmin), rr[3], rr[4])


def rr_lerp(a, b, u):
    return tuple(lerp(a[k], b[k], u) for k in range(5))


def _side_off(kind, val, half, halfseg=False):
    if kind == "f":
        return val * half if halfseg else -half + 2.0 * half * val
    if kind == "a":
        return val
    f, g, which = val
    if which == 0:
        return -half + (half - g) * f
    return g + (half - g) * f


def rr_eval(spec, rr, delta=0.0):
    """Point on the rounded rectangle for a ring spec; delta = arc offset along the ring."""
    seg, kind, val = spec[0], spec[1], spec[2]
    hw, hh, r, ca, cb = rr
    L, M = hw - r, hh - r
    if seg in CORNERS:
        a0, sa, sb = CORNERS[seg]
        ang = a0 + val * 0.5 * pi + delta / max(r, 1e-6)
        return (ca + sa * L + r * cos(ang), cb + sb * M + r * sin(ang))
    if seg == B_P:
        return (ca + _side_off(kind, val, L, True) + delta, cb - hh)
    if seg == B_M:
        return (ca - L + _side_off(kind, val, L, True) + delta, cb - hh)
    if seg == R_:
        return (ca + hw, cb + _side_off(kind, val, M) + delta)
    if seg == T_:
        return (ca - _side_off(kind, val, L) - delta, cb + hh)
    return (ca - hw, cb - _side_off(kind, val, M) - delta)   # L_


def ring_specs(nb=2, nc=8, ns=2, nt=3, right=None, top=None, left=None):
    """Standard ring: half-bottoms, corners, sides; optional custom side spec lists."""
    s = [(B_P, "f", i / nb) for i in range(nb)]
    s += [(BR, "c", i / nc) for i in range(nc)]
    s += right if right is not None else [(R_, "f", i / ns) for i in range(ns)]
    s += [(TR, "c", i / nc) for i in range(nc)]
    s += top if top is not None else [(T_, "f", i / nt) for i in range(nt)]
    s += [(TL, "c", i / nc) for i in range(nc)]
    s += left if left is not None else [(L_, "f", i / ns) for i in range(ns)]
    s += [(BL, "c", i / nc) for i in range(nc)]
    s += [(B_M, "f", i / nb) for i in range(nb)]
    return s


def slot_side_specs(seg, n_slots, n_margin=2):
    """Side spec with vent slots at absolute offsets from the side middle."""
    span = (n_slots - 1) / 2 * SLOT_PITCH + SLOT_W / 2
    g = span + 0.004
    specs = [(seg, "g", (k / n_margin, g, 0)) for k in range(n_margin)]
    for k in range(n_slots):
        c = (k - (n_slots - 1) / 2) * SLOT_PITCH
        specs += [(seg, "a", c - SLOT_W / 2, "edge"), (seg, "a", c - SLOT_W / 2 + SLOT_WALL, "bot"),
                  (seg, "a", c + SLOT_W / 2 - SLOT_WALL, "bot"), (seg, "a", c + SLOT_W / 2, "edge")]
    specs += [(seg, "g", (k / n_margin, g, 1)) for k in range(n_margin)]
    return specs


class Prof:
    """Piecewise profile.  Piece k spans t in [k, k+1]; fn(u) returns the station data."""

    def __init__(self):
        self.pieces = []

    def add(self, fn, nseg):
        self.pieces.append((fn, nseg))
        return self

    @property
    def tmax(self):
        return float(len(self.pieces))

    def at(self, t):
        k = min(max(int(math.floor(t)), 0), len(self.pieces) - 1)
        return self.pieces[k][0](t - k)

    def ts(self):
        out = []
        for k, (_, n) in enumerate(self.pieces):
            out += [k + i / n for i in range(n)]
        out.append(self.tmax)
        return out


def arc(u):
    """Quarter circle helper: returns (sin, cos) of u * 90deg."""
    return sin(u * 0.5 * pi), cos(u * 0.5 * pi)


# =============================================================================
# Mesh builder with exact custom normals
# =============================================================================
class MeshBuilder:
    def __init__(self):
        self.co, self.vn, self.dec = [], [], []
        self.faces, self.fmat, self.fflat, self.fdens = [], [], [], []

    def vert(self, p, n, decal=None):
        self.co.append(tuple(p))
        self.vn.append(tuple(n))
        self.dec.append(decal if decal is not None else (-10.0, -10.0))
        return len(self.co) - 1

    def face(self, vs, mat, flat=False, dens=1.0):
        self.faces.append(tuple(vs))
        self.fmat.append(mat)
        self.fflat.append(flat)
        self.fdens.append(dens)

    def tri_count(self):
        return sum(len(f) - 2 for f in self.faces)


def surface(mb, ncols, ts, tmax, P, orient=1, mat="beige", dens=1.0, disp=None,
            mat_fn=None, dens_fn=None, cap_start=None, cap_end=None, decal=None, closed=True):
    """Generic parametric surface.  P(i, t, d) -> (x, y, z) where i indexes the ring
    vertex, t is the profile parameter and d a small arc offset along the ring (used for
    the analytic normal).  cap_start / cap_end: None, 'flat' or 'smooth' fan caps."""
    nt = len(ts)
    pos = [[None] * nt for _ in range(ncols)]
    nor = [[None] * nt for _ in range(ncols)]
    dsp = [[0.0] * nt for _ in range(ncols)]
    h, e = 2e-5, 1e-4
    for j, t in enumerate(ts):
        ta, tb = max(t - e, 0.0), min(t + e, tmax)
        for i in range(ncols):
            p = P(i, t, 0.0)
            ds = v_sub(P(i, t, h), P(i, t, -h))
            dt = v_sub(P(i, tb, 0.0), P(i, ta, 0.0))
            n = v_norm(v_cross(ds, dt))
            if orient < 0:
                n = (-n[0], -n[1], -n[2])
            d = disp(i, j) if disp else 0.0
            if d:
                p = (p[0] - d * n[0], p[1] - d * n[1], p[2] - d * n[2])
            pos[i][j], nor[i][j], dsp[i][j] = p, n, d
    idx = [[mb.vert(pos[i][j], nor[i][j], decal(pos[i][j]) if decal else None)
            for j in range(nt)] for i in range(ncols)]

    def fmat(i, j):
        return (mat_fn(i, j) if mat_fn else None) or mat

    def fdens(i, j):
        return dens_fn(i, j) if dens_fn else dens

    ilim = ncols if closed else ncols - 1
    for j in range(nt - 1):
        for i in range(ilim):
            i2 = (i + 1) % ncols
            q = [idx[i][j], idx[i2][j], idx[i2][j + 1], idx[i][j + 1]]
            dd = [dsp[i][j] > 0, dsp[i2][j] > 0, dsp[i2][j + 1] > 0, dsp[i][j + 1] > 0]
            if orient < 0:
                q.reverse()
                dd.reverse()
            m, de = fmat(i, j), fdens(i, j)
            nd = sum(dd)
            if nd == 0:
                mb.face(q, m, False, de)
            elif nd == 4:
                mb.face(q, "vent", False, de)
            elif nd == 2:
                mb.face(q, m, True, de)          # slot wall: flat shaded
            else:                                # slot corner: split off the odd vertex
                odd = [k for k in range(4) if dd[k] == (nd == 1)][0]
                a, b, c, dq = (q[(odd + k) % 4] for k in range(4))
                mb.face([dq, a, b], m, True, de)             # wall triangle
                mb.face([b, c, dq], "vent" if nd == 3 else m, False, de)
    for cap, j in ((cap_start, 0), (cap_end, nt - 1)):
        if not cap:
            continue
        ring = [pos[i][j] for i in range(ncols)]
        cen = tuple(sum(p[k] for p in ring) / ncols for k in range(3))
        cn = v_norm(tuple(sum(nor[i][j][k] for i in range(ncols)) for k in range(3)))
        c = mb.vert(cen, cn, decal(cen) if decal else None)
        for i in range(ilim):
            i2 = (i + 1) % ncols
            tri = [idx[i][j], idx[i2][j], c] if j == nt - 1 else [c, idx[i2][j], idx[i][j]]
            if orient < 0:
                tri.reverse()
            mb.face(tri, fmat(i, max(j - 1, 0)), cap == "flat", fdens(i, max(j - 1, 0)))
    return idx


def frame_xzy(a, b, c):   # ring in the XZ plane, stacked along Y
    return (a, c, b)


def frame_xyz(a, b, c):   # ring in the XY plane, stacked along Z
    return (a, b, c)


def loft(mb, specs, prof, frame=frame_xzy, **kw):
    def P(i, t, d):
        c, rr = prof.at(t)
        a, b = rr_eval(specs[i], rr, d)
        return frame(a, b, c(a, b) if callable(c) else c)
    return surface(mb, len(specs), prof.ts(), prof.tmax, P, **kw)


def lathe(mb, nseg, prof, frame, flute=None, phase=0.0, **kw):
    """Surface of revolution; prof.at(t) -> (height, radius).  frame(a, b, h) -> xyz with
    (a, b) = r (cos phi, sin phi)."""
    phis = [phase + 2 * pi * k / nseg for k in range(nseg)]

    def P(i, t, d):
        hgt, r = prof.at(t)
        phi = phis[i] + d / max(r, 1e-4)
        if flute:
            r -= flute(t, phi)
        return frame(r * cos(phi), r * sin(phi), hgt)
    return surface(mb, nseg, prof.ts(), prof.tmax, P, **kw)


# =============================================================================
# Parts of the Body
# =============================================================================
OUTER = (HW, HH, R_OUT, 0.0, ZC)
MOUTH = (OW / 2 + FW, OH / 2 + FW, OR + FW, 0.0, ZO)
OPEN = (OW / 2, OH / 2, OR, 0.0, ZO)

# chin print decal window (x0, z0, width, height) in metres
CHIN_DECAL = (-HW, Z0, 2 * HW, 0.070)


def chin_decal(p):
    x0, z0, w, h = CHIN_DECAL
    if p[1] > YF + 0.004:
        return None
    return ((p[0] - x0) / w, (p[2] - z0) / h)


def housing_rr(y):
    hw = soft_pw(y, Y_K, Y2, HW - STEP, HW_B, DK, D2)
    zt = soft_pw(y, Y_K, Y2, Z0 + 2 * HH - STEP, ZT_B, DK, D2)
    zb = soft_pw(y, Y_K, Y2, Z0 + STEP, ZB_B, DK, D2)
    r = soft_pw(y, Y_K, Y2, R_OUT - STEP, R_BK, DK, D2)
    return (hw, (zt - zb) / 2, r, 0.0, (zt + zb) / 2)


def build_bezel(mb):
    """Front bezel: rounded lip around the funnel mouth, flat face, generous front fillet,
    short side wall, rolling into the parting-line groove."""
    pr = Prof()
    pr.add(lambda u: (lerp(YF + 0.009, YF + R_LIP, u), MOUTH), 1)
    pr.add(lambda u: (YF + R_LIP * (1 - arc(u)[0]), rr_off(MOUTH, R_LIP * (1 - arc(u)[1]))), 4)
    pr.add(lambda u: (YF, rr_lerp(rr_off(MOUTH, R_LIP), rr_off(OUTER, -R_FE), u)), 2)
    pr.add(lambda u: (YF + R_FE * (1 - arc(u)[1]), rr_off(OUTER, -R_FE * (1 - arc(u)[0]))), 6)
    pr.add(lambda u: (lerp(YF + R_FE, Y_GROOVE - R_G, u), OUTER), 1)
    pr.add(lambda u: (Y_GROOVE - R_G + R_G * arc(u)[0], rr_off(OUTER, -R_G * (1 - arc(u)[1]))), 3)
    pr.add(lambda u: (Y_GROOVE, rr_off(OUTER, -R_G - 0.003 * u)), 1)
    specs = ring_specs(nb=3, nc=8, ns=3, nt=4)
    ts = pr.ts()

    def dens_fn(i, j):
        t = ts[j]
        return 1.2 if t < 1 else 1.8 if t < 4 else 1.1 if t < 5 else 0.25
    loft(mb, specs, pr, orient=-1, mat="beige", dens_fn=dens_fn, decal=chin_decal)


def build_surround(mb):
    """Dark charcoal funnel ("picture frame") between the lip and the glass."""
    def depth(u):
        return u + 0.3 * u * (1 - u)          # slightly concave scoop
    pr = Prof()
    pr.add(lambda u: (Y_MOUTH, rr_off(MOUTH, 0.003 * (1 - u))), 1)
    pr.add(lambda u: ((lambda a, b: lerp(Y_MOUTH, glass_y(a, b) - 0.0008, depth(u))),
                      rr_off(MOUTH, -FW * u)), 7)
    pr.add(lambda u: ((lambda a, b: glass_y(a, b) - 0.0008 + 0.004 * u), rr_off(OPEN, -0.002 * u)), 1)
    specs = ring_specs(nb=4, nc=8, ns=6, nt=8)
    ts = pr.ts()
    loft(mb, specs, pr, orient=1, mat="charcoal",
         dens_fn=lambda i, j: 0.12 if (ts[j] < 1 or ts[j] >= 8) else 1.5)


def build_housing(mb):
    """Rear housing: front section, soft knee, tapered bell with vents, back cap."""
    YG1 = Y_GROOVE + GAP
    HOUT = housing_rr(YG1)

    def seg_y(y0, y1):
        return lambda u: (lerp(y0, y1, u), housing_rr(lerp(y0, y1, u)))
    pr = Prof()
    pr.add(lambda u: (YG1, rr_off(HOUT, -R_G - 0.003 * (1 - u))), 1)
    pr.add(lambda u: (YG1 + R_G * (1 - arc(u)[1]), rr_off(HOUT, -R_G * (1 - arc(u)[0]))), 3)
    pr.add(seg_y(YG1 + R_G, Y_K - DK), 1)
    pr.add(seg_y(Y_K - DK, Y_K + DK), 6)
    pr.add(seg_y(Y_K + DK, Y_V0), 2)
    pr.add(seg_y(Y_V0, Y_V0 + E_V), 1)
    pr.add(seg_y(Y_V0 + E_V, Y_V1 - E_V), 2)
    pr.add(seg_y(Y_V1 - E_V, Y_V1), 1)
    pr.add(seg_y(Y_V1, Y2 - D2), 1)
    pr.add(seg_y(Y2 - D2, YB - R_B), 3)
    base_b = housing_rr(YB - R_B)
    pr.add(lambda u: (YB - R_B + R_B * arc(u)[0], rr_off(base_b, -R_B * (1 - arc(u)[1]))), 6)
    specs = ring_specs(nb=3, nc=8,
                       right=slot_side_specs(R_, N_SIDE_SLOTS),
                       top=slot_side_specs(T_, N_TOP_SLOTS, 3),
                       left=slot_side_specs(L_, N_SIDE_SLOTS))
    ts = pr.ts()
    ys = [pr.at(t)[0] for t in ts]
    inner = [Y_V0 + E_V - 1e-7 <= y <= Y_V1 - E_V + 1e-7 for y in ys]

    def disp(i, j):
        return VENT_D if (inner[j] and len(specs[i]) > 3 and specs[i][3] == "bot") else 0.0

    def dens_fn(i, j):
        if ts[j] < 4:                        # inside / lip of the parting line groove
            return 0.35
        if specs[i][0] in (B_P, B_M):        # underside
            return 0.4
        if ys[j] > YB - R_B - 1e-6:          # back edge and rear panel
            return 0.75
        return 1.0
    loft(mb, specs, pr, orient=-1, mat="beige_h", disp=disp, dens_fn=dens_fn, cap_end="flat")


def build_pedestal(mb):
    """Low tilt/swivel foot plus a short neck (with a swivel seam)."""
    z_top = FOOT_H + 0.003
    z_sw = z_top + R_NF + 0.007
    pr = Prof()
    pr.add(lambda u: (R_BB * (1 - arc(u)[1]), rr_off(FOOT, -R_BB * (1 - arc(u)[0]))), 3)
    pr.add(lambda u: (lerp(R_BB, FOOT_H - R_FT, u), FOOT), 1)
    pr.add(lambda u: (FOOT_H - R_FT + R_FT * arc(u)[0], rr_off(FOOT, -R_FT * (1 - arc(u)[1]))), 5)
    pr.add(lambda u: (FOOT_H + 0.003 * smoothstep(u),
                      rr_lerp(rr_off(FOOT, -R_FT), rr_off(NECK, R_NF), u)), 3)
    pr.add(lambda u: (z_top + R_NF * (1 - arc(u)[1]), rr_off(NECK, R_NF * (1 - arc(u)[0]))), 4)
    pr.add(lambda u: (lerp(z_top + R_NF, z_sw - 0.0012, u), NECK), 1)
    pr.add(lambda u: (lerp(z_sw - 0.0012, z_sw + 0.0012, u),
                      rr_off(NECK, -0.0009 * (0.5 - 0.5 * cos(2 * pi * u)))), 4)
    pr.add(lambda u: (lerp(z_sw + 0.0012, Z0 + 0.014, u), NECK), 1)
    specs = ring_specs(nb=2, nc=10, ns=2, nt=3)
    nts = len(pr.ts())

    def dens_fn(i, j):
        return 0.2 if j < 2 else 0.1 if j >= nts - 2 else 0.75
    loft(mb, specs, pr, frame=frame_xyz, orient=1, mat="beige_b", dens_fn=dens_fn, cap_start="flat")


def build_collar(mb):
    """Square beige collar around the power button, with a dark recess."""
    outr = (0.0175, 0.0175, 0.0055, BTN_X, Z_CTRL)
    inr = (BTN_HALF + 0.0018, BTN_HALF + 0.0018, BTN_R + 0.0012, BTN_X, Z_CTRL)
    ch, rc = 0.0026, 0.0010
    pr = Prof()
    pr.add(lambda u: (lerp(YF + 0.001, YF - ch + rc, u), outr), 1)
    pr.add(lambda u: (YF - ch + rc * (1 - arc(u)[0]), rr_off(outr, -rc * (1 - arc(u)[1]))), 3)
    pr.add(lambda u: (YF - ch, rr_lerp(rr_off(outr, -rc), rr_off(inr, rc), u)), 1)
    pr.add(lambda u: (YF - ch + rc * (1 - arc(u)[1]), rr_off(inr, rc * (1 - arc(u)[0]))), 3)
    pr.add(lambda u: (lerp(YF - ch + rc, YF + 0.005, u), inr), 1)
    pr.add(lambda u: (YF + 0.005, rr_in(inr, 0.009 * u)), 1)
    specs = ring_specs(nb=1, nc=6, ns=2, nt=2)
    nts = len(pr.ts())

    def mat_fn(i, j):
        return "vent" if j >= nts - 3 else None
    loft(mb, specs, pr, orient=1, mat="beige", mat_fn=mat_fn, cap_end="flat", decal=chin_decal,
         dens_fn=lambda i, j: 0.3 if j >= nts - 3 else 1.4)


def build_badge(mb):
    """Small metal badge plate on the left of the chin (text comes from a mask)."""
    bw, bh = 0.078, 0.027
    rr = (bw / 2, bh / 2, 0.004, BADGE_X, BADGE_Z)
    th, rb = 0.0016, 0.0007
    pr = Prof()
    pr.add(lambda u: (lerp(YF + 0.0008, YF - th + rb, u), rr), 1)
    pr.add(lambda u: (YF - th + rb * (1 - arc(u)[0]), rr_off(rr, -rb * (1 - arc(u)[1]))), 3)
    specs = ring_specs(nb=3, nc=5, ns=2, nt=6)

    def decal(p):
        return ((p[0] - (BADGE_X - bw / 2)) / bw, (p[2] - (BADGE_Z - bh / 2)) / bh)
    loft(mb, specs, pr, orient=1, mat="badge", dens=3.2, cap_end="flat", decal=decal)


def build_led_ring(mb):
    """Chrome bezel ring around the power LED."""
    pr = Prof()
    ri, ro, top = 0.0032, 0.0054, 0.0010
    rc = (ro - ri) / 2
    pr.add(lambda u: (lerp(-0.001, top, u), ri), 1)
    pr.add(lambda u: (top + rc * sin(u * pi), ri + rc - rc * cos(u * pi)), 6)
    pr.add(lambda u: (lerp(top, -0.001, u), ro), 1)

    def frame(a, b, hgt):
        return (LED_X + a, YF - hgt, Z_CTRL + b)
    lathe(mb, 24, pr, frame, orient=-1, mat="metal", dens=1.5)


def build_rear_details(mb):
    """Rear: label plate, screws, video connector, power cord with strain relief."""
    # --- paper label (rating plate)
    lw, lh, lx, lz = 0.082, 0.050, -0.030, 0.232
    rr = (lw / 2, lh / 2, 0.0025, lx, lz)
    pr = Prof()
    pr.add(lambda u: (lerp(YB - 0.0006, YB + 0.0003, u), rr), 1)
    pr.add(lambda u: (YB + 0.0003 + 0.0002 * arc(u)[0], rr_off(rr, -0.0002 * (1 - arc(u)[1]))), 2)

    def ldec(p):
        return ((p[0] - (lx - lw / 2)) / lw, (p[2] - (lz - lh / 2)) / lh)
    loft(mb, ring_specs(nb=2, nc=4, ns=2, nt=3), pr, orient=-1, mat="label", dens=1.6,
         cap_end="flat", decal=ldec)

    # --- screws (pan head, cross recess from the decal coordinates)
    for sx, sz in ((-0.088, 0.285), (0.088, 0.285), (-0.088, 0.112), (0.088, 0.112)):
        pr = Prof()
        rs, hs = 0.0048, 0.0024
        pr.add(lambda u: (lerp(-0.0005, 0.0006, u), rs), 1)
        pr.add(lambda u: (0.0006 + (hs - 0.0006) * sin(u * pi / 2), rs * cos(u * pi / 2 * 0.93)), 5)

        def frame(a, b, hgt, sx=sx, sz=sz):
            return (sx + a, YB + hgt, sz + b)

        def sdec(p, sx=sx, sz=sz):
            return (0.5 + (p[0] - sx) / (2 * rs), 0.5 + (p[2] - sz) / (2 * rs))
        lathe(mb, 20, pr, frame, orient=-1, mat="screw", dens=1.2, cap_end="smooth", decal=sdec)

    # --- video connector: charcoal plate + metal shell + two standoffs
    cx, cz = -0.052, 0.140
    plate = (0.024, 0.011, 0.003, cx, cz)
    pr = Prof()
    pr.add(lambda u: (lerp(YB - 0.001, YB + 0.004, u), plate), 1)
    pr.add(lambda u: (YB + 0.004 + 0.001 * arc(u)[0], rr_off(plate, -0.001 * (1 - arc(u)[1]))), 3)
    loft(mb, ring_specs(nb=2, nc=4, ns=2, nt=3), pr, orient=-1, mat="charcoal", dens=1.0, cap_end="flat")
    shell = (0.0135, 0.0058, 0.0025, cx, cz)
    pr = Prof()
    pr.add(lambda u: (lerp(YB + 0.004, YB + 0.0105, u), shell), 1)
    pr.add(lambda u: (YB + 0.0105 + 0.0006 * arc(u)[0], rr_off(shell, -0.0006 * (1 - arc(u)[1]))), 2)
    pr.add(lambda u: (YB + 0.0111, rr_off(shell, -0.0006 - 0.0012 * u)), 1)
    pr.add(lambda u: (lerp(YB + 0.0111, YB + 0.007, u), rr_off(shell, -0.0018)), 1)
    nts = len(pr.ts())
    loft(mb, ring_specs(nb=2, nc=4, ns=2, nt=3), pr, orient=-1, mat="metal", dens=1.0,
         mat_fn=lambda i, j: "vent" if j >= nts - 2 else None, cap_end="flat")
    for ox in (-0.0185, 0.0185):
        pr = Prof()
        pr.add(lambda u: (lerp(YB + 0.003, YB + 0.0085, u), 0.0021), 1)
        pr.add(lambda u: (YB + 0.0085, 0.0021 * (1 - 0.6 * u)), 1)

        def frame(a, b, hgt, ox=ox):
            return (cx + ox + a, hgt, cz + b)
        lathe(mb, 6, pr, frame, orient=-1, mat="metal", dens=0.8, cap_end="flat", phase=pi / 6)

    # --- power cord: ribbed strain relief + cord drooping to the desk
    px, pz = 0.058, 0.112
    boot_l = 0.030
    pr = Prof()
    pr.add(lambda u: (lerp(-0.001, 0.004, u), 0.0082), 1)
    pr.add(lambda u: (lerp(0.004, boot_l, u), lerp(0.0075, 0.0046, u) *
                      (1.0 - 0.06 * max(0.0, sin(u * 10 * pi)))), 20)
    pr.add(lambda u: (boot_l, 0.0046 * (1 - u) + 0.0033 * u), 1)

    def frame(a, b, hgt):
        return (px + a, YB + hgt, pz + b)
    lathe(mb, 16, pr, frame, orient=-1, mat="charcoal", dens=0.8)

    # cord path in the plane x = px: straight back, arc down, straight down, arc along desk
    rc = 0.0033
    y0 = YB + boot_l - 0.002
    R1, R2 = 0.040, 0.030
    z_desk = rc
    seg = []   # (point, tangent) samples
    n1 = 10
    for k in range(n1 + 1):
        th = k / n1 * (pi / 2)
        seg.append(((y0 + R1 * sin(th), pz - R1 + R1 * cos(th)), (cos(th), -sin(th))))
    z1 = z_desk + R2
    zst = pz - R1
    for k in range(1, 4):
        seg.append(((y0 + R1, lerp(zst, z1, k / 3)), (0.0, -1.0)))
    for k in range(1, n1 + 1):
        th = k / n1 * (pi / 2)
        seg.append(((y0 + R1 + R2 - R2 * cos(th), z1 - R2 * sin(th)), (sin(th), -cos(th))))
    yend = y0 + R1 + R2 + 0.035
    for k in range(1, 4):
        seg.append(((lerp(y0 + R1 + R2, yend, k / 3), z_desk), (1.0, 0.0)))
    nseg = len(seg) - 1

    def cordP(i, t, d, nring=12):
        k = min(int(t), nseg - 1)
        u = t - k
        (ya, za), (ta, sa) = seg[k]
        (yb, zb), (tb, sb) = seg[k + 1]
        yy, zz = lerp(ya, yb, u), lerp(za, zb, u)
        ty, tz = lerp(ta, tb, u), lerp(sa, sb, u)
        ln = sqrt(ty * ty + tz * tz)
        ty, tz = ty / ln, tz / ln
        nyy, nzz = -tz, ty                          # normal in the YZ plane
        phi = 2 * pi * i / nring + d / rc
        return (px + rc * sin(phi), yy + rc * cos(phi) * nyy, zz + rc * cos(phi) * nzz)
    ts = [float(k) for k in range(nseg + 1)]
    surface(mb, 12, ts, float(nseg), cordP, orient=1, mat="rubber", dens=0.6, cap_end="flat")


def build_asset_tag(mb):
    """Small silver barcode asset tag on the left side of the front section."""
    tw, th = 0.044, 0.017
    yc, zc = -0.083, 0.318
    rr = (tw / 2, th / 2, 0.0015, yc, zc)

    def frame(a, b, c):
        return (c, -a, b)          # ring plane = YZ (a = -y so it reads left-to-right)
    pr = Prof()
    xs = -housing_rr(yc)[0]           # housing side wall at the tag
    pr.add(lambda u: (lerp(xs + 0.0006, xs - 0.00025, u), (tw / 2, th / 2, 0.0015, -yc, zc)), 1)
    pr.add(lambda u: (xs - 0.00025 - 0.0001 * arc(u)[0],
                      rr_off((tw / 2, th / 2, 0.0015, -yc, zc), -0.0001 * (1 - arc(u)[1]))), 1)

    def decal(p):
        return (((-p[1]) - (-yc - tw / 2)) / tw, (p[2] - (zc - th / 2)) / th)
    loft(mb, ring_specs(nb=2, nc=3, ns=2, nt=3), pr, frame=frame, orient=1, mat="tag", dens=2.2,
         cap_end="flat", decal=decal)


def build_sticky_note(mb):
    """Yellow sticky note on the top-right of the bezel, bottom edge curling away."""
    s = 0.052
    cx, cz = 0.178, 0.366
    ang = math.radians(-5.0)
    n = 10
    ca, sa = cos(ang), sin(ang)

    def pt(u, v, back=False):
        # local note coordinates, u right, v up; adhesive strip at the top (v > 0.78)
        x, z = (u - 0.5) * s, (v - 0.5) * s
        free = max(0.0, 0.8 - v) / 0.8
        lift = 0.0065 * free ** 2.2 + 0.0022 * free ** 2 * u
        y = YF - 0.00035 - lift + (0.00012 if back else 0.0)
        return (cx + ca * x - sa * z, y, cz + sa * x + ca * z)

    def nrm(u, v, back=False):
        e = 1e-3
        a = v_sub(pt(u + e, v), pt(u - e, v))
        b = v_sub(pt(u, v + e), pt(u, v - e))
        nn = v_norm(v_cross(a, b))
        return tuple(-k for k in nn) if back else nn
    for back in (False, True):
        ids = [[mb.vert(pt(i / n, j / n, back), nrm(i / n, j / n, back),
                        None if back else (i / n, j / n)) for j in range(n + 1)] for i in range(n + 1)]
        for i in range(n):
            for j in range(n):
                q = [ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]]
                if back:                 # front side faces -Y with this winding
                    q.reverse()
                mb.face(q, "paper", False, 1.4 if not back else 0.3)
    # normal sanity: first front vertex normal must face -Y
    return


# =============================================================================
# Separate parts
# =============================================================================
def build_power_button():
    """Chunky square push button; local origin = centre of its front face."""
    mb = MeshBuilder()
    btn = (BTN_HALF, BTN_HALF, BTN_R, 0.0, 0.0)
    rb = 0.0022
    pr = Prof()
    pr.add(lambda u: (lerp(BTN_DEPTH, rb, u), btn), 1)
    pr.add(lambda u: (rb * (1 - arc(u)[0]), rr_off(btn, -rb * (1 - arc(u)[1]))), 4)
    pr.add(lambda u: (0.0005 * u * u, rr_in(rr_off(btn, -rb), 0.0068 * u)), 3)

    def decal(p):
        return (0.5 + p[0] / (2 * BTN_HALF), 0.5 + p[2] / (2 * BTN_HALF))
    loft(mb, ring_specs(nb=2, nc=6, ns=2, nt=3), pr, orient=1, mat="charcoal",
         dens_fn=lambda i, j: 0.6 if j < 1 else 1.6, cap_end="smooth", decal=decal)
    return mb


def knob_builder(flutes=20):
    """Fluted rotary knob with a skirt; local origin on the axis at the panel surface,
    axis = -Y (towards the viewer)."""
    mb = MeshBuilder()
    rsk, skh, rk, kh, re = KNOB_SKIRT_R, 0.0026, KNOB_R, KNOB_H, 0.0028
    rs1, rf = 0.0007, 0.0006
    pr = Prof()
    pr.add(lambda u: (lerp(-0.001, skh - rs1, u), rsk), 1)                              # 0 skirt wall
    pr.add(lambda u: (skh - rs1 + rs1 * arc(u)[0], rsk - rs1 * (1 - arc(u)[1])), 2)     # 1 skirt edge
    pr.add(lambda u: (skh, lerp(rsk - rs1, rk + rf, u)), 1)                             # 2 skirt top
    pr.add(lambda u: (skh + rf * (1 - arc(u)[1]), rk + rf * (1 - arc(u)[0])), 2)        # 3 fillet
    pr.add(lambda u: (lerp(skh + rf, kh - re, u), rk), 2)                               # 4 fluted wall
    pr.add(lambda u: (kh - re + re * arc(u)[0], rk - re * (1 - arc(u)[1])), 4)          # 5 front edge
    pr.add(lambda u: (kh + 0.0004 * (1 - (1 - u) ** 2), lerp(rk - re, 0.0025, u)), 2)   # 6 face
    amp, nfl = 0.00065, flutes

    def flute(t, phi):
        if t < 3.0 or t > 6.0:
            return 0.0
        if t < 4.0:
            w = smoothstep(t - 3.0)
        elif t <= 5.0:
            w = 1.0
        else:
            w = 1.0 - smoothstep((t - 5.0) * 1.15)
        return amp * w * (0.5 - 0.5 * cos(nfl * phi))

    def frame(a, b, hgt):
        return (a, -hgt, b)

    def decal(p):
        return (0.5 + p[0] / (2 * rk), 0.5 + p[2] / (2 * rk))
    lathe(mb, nfl * 3, pr, frame, flute=flute, orient=1, mat="charcoal", dens=1.5,
          cap_end="smooth", decal=decal, phase=pi / 2)
    return mb


def build_led():
    mb = MeshBuilder()
    pr = Prof()
    rl = 0.0030
    pr.add(lambda u: (lerp(-0.002, 0.0008, u), rl), 1)
    pr.add(lambda u: (0.0008 + 0.0017 * sin(u * pi / 2), rl * cos(u * pi / 2 * 0.9)), 5)

    def frame(a, b, hgt):
        return (a, -hgt, b)
    lathe(mb, 20, pr, frame, orient=1, mat="LED", cap_end="smooth")
    return mb


def build_screen():
    """CRT glass: spherical cap, planar front UVs (u: left->right, v: bottom->top)."""
    co, nrm, uv, faces = [], [], [], []
    yc = Y_GLASS + RS
    for j in range(GNY + 1):
        for i in range(GNX + 1):
            x = -GW / 2 + GW * i / GNX
            z = ZO - GH / 2 + GH * j / GNY
            y = glass_y(x, z)
            co.append((x, y, z))
            nrm.append(v_norm((x, y - yc, z - ZO)))
            uv.append((i / GNX, j / GNY))
    for j in range(GNY):
        for i in range(GNX):
            a = j * (GNX + 1) + i
            faces.append((a, a + 1, a + (GNX + 1) + 1, a + (GNX + 1)))   # faces -Y
    return co, nrm, uv, faces


# =============================================================================
# Shader node helpers
# =============================================================================
class NodeBuilder:
    def __init__(self, mat):
        try:
            mat.use_nodes = True
        except Exception:
            pass
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.count = 0

    def node(self, typ, **props):
        n = self.nt.nodes.new(typ)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = ((self.count % 12) * 220, -(self.count // 12) * 260)
        self.count += 1
        return n

    def set(self, sock, val):
        if isinstance(val, bpy.types.NodeSocket):
            self.nt.links.new(val, sock)
        elif val is not None:
            sock.default_value = val

    def math(self, op, a, b=None, c=None, clamp=False):
        m = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.set(m.inputs[0], a)
        if b is not None:
            self.set(m.inputs[1], b)
        if c is not None:
            self.set(m.inputs[2], c)
        return m.outputs[0]

    def mixf(self, fac, a, b):
        m = self.node("ShaderNodeMix", data_type="FLOAT", clamp_factor=True)
        self.set(m.inputs[0], fac)
        self.set(m.inputs[2], a)
        self.set(m.inputs[3], b)
        return m.outputs[0]

    def mixc(self, fac, a, b, blend="MIX"):
        m = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend, clamp_factor=True)
        self.set(m.inputs[0], fac)
        self.set(m.inputs[6], a)
        self.set(m.inputs[7], b)
        return m.outputs[2]

    def rgb(self, c):
        n = self.node("ShaderNodeRGB")
        n.outputs[0].default_value = c
        return n.outputs[0]

    def noise(self, vec, scale, detail=2.0, rough=0.5, distortion=0.0, color=False):
        n = self.node("ShaderNodeTexNoise", noise_dimensions="3D")
        self.set(n.inputs["Vector"], vec)
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        n.inputs["Distortion"].default_value = distortion
        return n.outputs["Color"] if color else n.outputs["Factor"]

    def voronoi(self, vec, scale, feature="F1", out="Distance"):
        n = self.node("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature=feature)
        self.set(n.inputs["Vector"], vec)
        n.inputs["Scale"].default_value = scale
        return n.outputs[out]

    def smooth(self, x, e0, e1):
        m = self.node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
        self.set(m.inputs[0], x)
        m.inputs[1].default_value = e0
        m.inputs[2].default_value = e1
        return m.outputs[0]

    def remap(self, x, a0, a1, b0, b1):
        m = self.node("ShaderNodeMapRange", clamp=True)
        self.set(m.inputs[0], x)
        m.inputs[1].default_value = a0
        m.inputs[2].default_value = a1
        m.inputs[3].default_value = b0
        m.inputs[4].default_value = b1
        return m.outputs[0]

    def ao(self, dist, samples=8, inside=False, only_local=False):
        n = self.node("ShaderNodeAmbientOcclusion", samples=samples, inside=inside, only_local=only_local)
        n.inputs["Distance"].default_value = dist
        return n.outputs["AO"]

    def image(self, img, uv="Decal", ext="CLIP", interp="Cubic"):
        u = self.node("ShaderNodeUVMap", uv_map=uv)
        t = self.node("ShaderNodeTexImage", image=img, extension=ext, interpolation=interp)
        self.set(t.inputs["Vector"], u.outputs["UV"])
        return self.math("MULTIPLY", t.outputs["Color"], 1.0)   # colour -> float

    def bump(self, height, dist, strength=1.0, normal=None):
        b = self.node("ShaderNodeBump")
        b.inputs["Strength"].default_value = strength
        b.inputs["Distance"].default_value = dist
        self.set(b.inputs["Height"], height)
        if normal is not None:
            self.set(b.inputs["Normal"], normal)
        return b.outputs["Normal"]

    def sep(self, vec):
        s = self.node("ShaderNodeSeparateXYZ")
        self.set(s.inputs[0], vec)
        return s.outputs


# =============================================================================
# Bake materials
# =============================================================================
class BakeMat:
    """Procedural material used as the source of all bakes (and for --no-bake previews).
    mode(): RENDER / NORMAL -> Principled BSDF,  COLOR -> emission of the base colour,
    ORM -> emission of (AO, roughness, metallic)."""
    registry = {}

    def __init__(self, name):
        self.name = name
        self.mat = bpy.data.materials.new("bk_" + name)
        self.nb = NodeBuilder(self.mat)
        nb = self.nb
        self.out = nb.node("ShaderNodeOutputMaterial", target="ALL")
        self.bsdf = nb.node("ShaderNodeBsdfPrincipled")
        self.emit = nb.node("ShaderNodeEmission")
        self.comb = nb.node("ShaderNodeCombineColor")
        self.target = nb.node("ShaderNodeTexImage")
        self.tc = nb.node("ShaderNodeTexCoord")
        self.geo = nb.node("ShaderNodeNewGeometry")
        self.color = None
        BakeMat.registry[name] = self

    @property
    def P(self):
        return self.tc.outputs["Object"]

    def finish(self, color, rough, metal, normal, ao):
        nb = self.nb
        self.color = color
        nb.set(self.bsdf.inputs["Base Color"], color)
        nb.set(self.bsdf.inputs["Roughness"], rough)
        nb.set(self.bsdf.inputs["Metallic"], metal)
        if normal is not None:
            nb.set(self.bsdf.inputs["Normal"], normal)
        nb.set(self.comb.inputs["Red"], ao)
        nb.set(self.comb.inputs["Green"], rough)
        nb.set(self.comb.inputs["Blue"], metal)
        self.mode("RENDER")

    def mode(self, m):
        nt = self.nb.nt
        for l in list(self.out.inputs["Surface"].links) + list(self.emit.inputs["Color"].links):
            nt.links.remove(l)
        if m in ("RENDER", "NORMAL"):
            nt.links.new(self.bsdf.outputs[0], self.out.inputs["Surface"])
            return
        if m == "COLOR":
            self.nb.set(self.emit.inputs["Color"], self.color)
        else:
            nt.links.new(self.comb.outputs[0], self.emit.inputs["Color"])
        self.emit.inputs["Strength"].default_value = 1.0
        nt.links.new(self.emit.outputs[0], self.out.inputs["Surface"])

    def set_target(self, img):
        self.target.image = img
        self.nb.nt.nodes.active = self.target


def orm_ao(nb, strength=0.9):
    ao = nb.ao(0.09, 16)
    return nb.math("MULTIPLY_ADD", ao, strength, 1.0 - strength)


def mat_plastic(name, base, rough, peel_scale=430.0, peel_dist=0.0005, yellow=0.0,
                grime=0.6, wear=0.3, dark=False, paint_mask=None, paint_col=None,
                tint=(1.0, 1.0, 1.0), dust=0.0, scuff=0.0, seed=0.0):
    """Moulded ABS: large blotchy discolouration, UV yellowing on up-facing surfaces, dust,
    AO-driven grime in crevices, polished/brightened convex edges, light scuffs and an
    orange-peel stipple in the normal."""
    bm = BakeMat(name)
    nb, P = bm.nb, bm.P
    if seed:
        m = nb.node("ShaderNodeMapping")
        nb.set(m.inputs["Vector"], P)
        m.inputs["Location"].default_value = (seed, seed * 0.7, seed * 1.3)
        P = m.outputs[0]
    col = nb.rgb(tuple(c * t for c, t in zip(rgb(base)[:3], tint)) + (1.0,))
    nA = nb.noise(P, 2.2, 3.0, 0.55)
    nB = nb.noise(P, 9.0, 3.0, 0.6)
    nF = nb.noise(P, 210.0, 2.0, 0.6)
    var = nb.math("MULTIPLY_ADD", nA, 0.10, 0.95)
    var = nb.math("ADD", var, nb.math("MULTIPLY_ADD", nF, 0.04, -0.02))
    col = nb.mixc(1.0, col, var, "MULTIPLY")
    nz = nb.sep(bm.geo.outputs["Normal"])["Z"]
    if yellow > 0:
        up = nb.smooth(nz, 0.2, 0.95)
        f = nb.math("MULTIPLY", up, nb.math("MULTIPLY_ADD", nA, 0.9, 0.55))
        f = nb.math("MULTIPLY", f, yellow)
        ycol = nb.mixc(1.0, col, (1.0, 0.93, 0.76, 1.0), "MULTIPLY")
        col = nb.mixc(f, col, ycol)
    # grime / dust in crevices (AO driven)
    ao_n = nb.ao(0.025, 8)
    g = nb.math("POWER", nb.math("SUBTRACT", 1.0, ao_n, clamp=True), 1.2)
    g = nb.math("MULTIPLY", g, nb.math("MULTIPLY_ADD", nB, 0.9, 0.55))
    g = nb.math("MULTIPLY", g, grime, clamp=True)
    if dark:
        col = nb.mixc(nb.math("MULTIPLY", g, 0.45), col, (0.040, 0.037, 0.034, 1.0))
    else:
        col = nb.mixc(g, col, nb.mixc(1.0, col, (0.46, 0.40, 0.31, 1.0), "MULTIPLY"))
    # edge wear: convex edges found with an inside AO probe
    ao_in = nb.ao(0.005, 8, inside=True)
    edge = nb.smooth(nb.math("SUBTRACT", 1.0, ao_in), 0.10, 0.45)
    edge = nb.math("MULTIPLY", edge, nb.math("MULTIPLY_ADD", nF, 0.9, 0.55))
    edge = nb.math("MULTIPLY", edge, wear, clamp=True)
    if dark:
        col = nb.mixc(edge, col, (0.060, 0.056, 0.052, 1.0))
    else:
        col = nb.mixc(edge, col, nb.mixc(0.16, col, (1.0, 1.0, 0.97, 1.0)))
    rough_s = nb.math("ADD", rough, nb.math("MULTIPLY_ADD", nB, 0.12, -0.06))
    rough_s = nb.math("ADD", rough_s, nb.math("MULTIPLY", g, 0.18))
    rough_s = nb.math("SUBTRACT", rough_s, nb.math("MULTIPLY", edge, 0.25))
    # light scuffs, mostly on and near convex edges
    if scuff > 0:
        ns = nb.noise(P, 38.0, 5.0, 0.72, distortion=0.6)
        sc = nb.smooth(ns, 0.64, 0.72)
        near_edge = nb.smooth(nb.math("SUBTRACT", 1.0, ao_in), 0.02, 0.25)
        sc = nb.math("MULTIPLY", nb.math("MULTIPLY", sc, near_edge), scuff, clamp=True)
        col = nb.mixc(sc, col, nb.mixc(1.0, col, (0.80, 0.78, 0.76, 1.0), "MULTIPLY"))
        rough_s = nb.math("SUBTRACT", rough_s, nb.math("MULTIPLY", sc, 0.12))
    # fine dust on up-facing surfaces
    if dust > 0:
        nd = nb.noise(P, 140.0, 4.0, 0.75)
        up2 = nb.smooth(nz, 0.55, 0.95)
        dd = nb.math("MULTIPLY", nb.math("MULTIPLY", up2, nb.smooth(nd, 0.5, 0.78)), dust, clamp=True)
        col = nb.mixc(dd, col, (0.62, 0.60, 0.56, 1.0))
        rough_s = nb.math("ADD", rough_s, nb.math("MULTIPLY", dd, 0.25))
    if paint_mask is not None:
        m = nb.image(paint_mask)
        col = nb.mixc(m, col, paint_col)
        rough_s = nb.mixf(m, rough_s, 0.42)
    rough_s = nb.math("MINIMUM", nb.math("MAXIMUM", rough_s, 0.05), 0.95)
    # orange-peel stipple + very soft large scale waviness
    peel = nb.noise(P, peel_scale, 1.0, 0.5)
    nrm = nb.bump(peel, peel_dist)
    wav = nb.noise(P, 5.0, 2.0, 0.5)
    nrm = nb.bump(wav, 0.0012, 0.5, nrm)
    if paint_mask is not None:
        nrm = nb.bump(m, 0.00006, 1.0, nrm)
    bm.finish(col, rough_s, 0.0, nrm, orm_ao(nb))
    return bm


def mat_simple(name, base, rough, metal=0.0, noise_amt=0.05, bump_scale=0.0, bump_dist=0.0,
               mask=None, mask_col=None, mask_rough=None, mask_metal=None, mask_bump=0.0,
               aniso=False, grime=0.3):
    bm = BakeMat(name)
    nb, P = bm.nb, bm.P
    col = nb.rgb(rgb(base) if max(base) > 1.0 else tuple(base) + (1.0,))
    n1 = nb.noise(P, 60.0, 3.0, 0.6)
    if aniso:
        m = nb.node("ShaderNodeMapping")
        nb.set(m.inputs["Vector"], P)
        m.inputs["Scale"].default_value = (1.0, 1.0, 60.0)
        n1 = nb.noise(m.outputs[0], 40.0, 4.0, 0.7)
    col = nb.mixc(1.0, col, nb.math("MULTIPLY_ADD", n1, noise_amt * 2, 1.0 - noise_amt), "MULTIPLY")
    ao_n = nb.ao(0.02, 8)
    g = nb.math("MULTIPLY", nb.math("SUBTRACT", 1.0, ao_n, clamp=True), grime)
    col = nb.mixc(g, col, nb.mixc(1.0, col, (0.45, 0.42, 0.38, 1.0), "MULTIPLY"))
    r = nb.math("MULTIPLY_ADD", n1, 0.10, rough - 0.05)
    mt = metal
    nrm = None
    if bump_scale > 0:
        nrm = nb.bump(nb.noise(P, bump_scale, 2.0, 0.5), bump_dist)
    if mask is not None:
        mk = nb.image(mask)
        col = nb.mixc(mk, col, mask_col)
        if mask_rough is not None:
            r = nb.mixf(mk, r, mask_rough)
        if mask_metal is not None:
            mt = nb.mixf(mk, metal, mask_metal)
        if mask_bump:
            nrm = nb.bump(mk, mask_bump, 1.0, nrm)
    bm.finish(col, r, mt, nrm, orm_ao(nb))
    return bm


def make_materials(masks):
    # three beige mouldings that aged slightly differently: bezel, rear housing, pedestal
    mat_plastic("beige", BEIGE, 0.50, peel_scale=880.0, peel_dist=0.00020, yellow=0.40, grime=0.65, wear=0.35,
                paint_mask=masks.get("chin"), paint_col=rgb((58, 54, 50)), dust=0.35, scuff=0.5)
    mat_plastic("beige_h", BEIGE, 0.52, peel_scale=880.0, peel_dist=0.00020, yellow=0.50, grime=0.65, wear=0.35,
                tint=(0.985, 0.972, 0.935), dust=0.5, scuff=0.35, seed=3.1)
    mat_plastic("beige_b", BEIGE, 0.50, peel_scale=880.0, peel_dist=0.00020, yellow=0.30, grime=0.75, wear=0.4,
                tint=(0.975, 0.97, 0.955), dust=0.4, scuff=0.8, seed=7.3)
    mat_plastic("charcoal", CHARCOAL, 0.55, peel_scale=1100.0, peel_dist=0.00013, grime=0.45,
                wear=0.5, dark=True, paint_mask=masks.get("charcoal"),
                paint_col=rgb((214, 210, 198)))
    mat_simple("vent", (0.010, 0.009, 0.008), 0.85, grime=0.0)
    mat_simple("badge", (0.012, 0.011, 0.010), 0.38, 0.0, noise_amt=0.03, aniso=True,
               mask=masks.get("badge"), mask_col=(0.80, 0.79, 0.76, 1.0), mask_rough=0.20,
               mask_metal=1.0, mask_bump=0.00025)
    mat_simple("metal", (0.62, 0.62, 0.60), 0.22, 1.0, noise_amt=0.06, grime=0.5)
    mat_simple("screw", (0.55, 0.55, 0.53), 0.30, 1.0, noise_amt=0.08, grime=0.5,
               mask=masks.get("screw"), mask_col=(0.02, 0.02, 0.02, 1.0), mask_rough=0.7,
               mask_metal=0.3, mask_bump=-0.0004)
    mat_simple("label", (226, 220, 202), 0.70, 0.0, noise_amt=0.04, bump_scale=900.0,
               bump_dist=0.00003, mask=masks.get("label"), mask_col=rgb((32, 31, 30)),
               mask_rough=0.45)
    mat_simple("tag", (0.62, 0.62, 0.60), 0.28, 0.9, noise_amt=0.05, aniso=True,
               mask=masks.get("tag"), mask_col=(0.012, 0.012, 0.012, 1.0), mask_rough=0.45,
               mask_metal=0.0)
    mat_simple("paper", POSTIT, 0.82, 0.0, noise_amt=0.035, bump_scale=1400.0,
               bump_dist=0.00002, mask=masks.get("paper"), mask_col=rgb((22, 28, 62)),
               mask_rough=0.55, grime=0.15)
    mat_simple("rubber", (27, 26, 25), 0.62, 0.0, noise_amt=0.05, bump_scale=900.0,
               bump_dist=0.00002)
    # final (non-baked) materials
    led = bpy.data.materials.new("LED")
    nb = NodeBuilder(led)
    out = nb.node("ShaderNodeOutputMaterial")
    b = nb.node("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.04, 0.25, 0.06, 1.0)
    b.inputs["Roughness"].default_value = 0.15
    b.inputs["Emission Color"].default_value = (0.20, 1.0, 0.28, 1.0)
    b.inputs["Emission Strength"].default_value = 3.0
    nb.set(out.inputs["Surface"], b.outputs[0])
    led.use_backface_culling = True
    scr = bpy.data.materials.new("Screen")
    scr.use_backface_culling = True
    nb = NodeBuilder(scr)
    out = nb.node("ShaderNodeOutputMaterial")
    b = nb.node("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = rgb((16, 21, 19))
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["IOR"].default_value = 1.52
    nb.set(out.inputs["Surface"], b.outputs[0])


# =============================================================================
# Text / graphics masks (rendered white-on-black with an orthographic Cycles camera)
# =============================================================================
def font(name):
    path = os.path.join(bpy.utils.system_resource("DATAFILES", path="fonts"), name)
    try:
        return bpy.data.fonts.load(path, check_existing=True)
    except Exception:
        return None


class MaskCanvas:
    """Canvas in millimetres, origin bottom-left."""

    def __init__(self, name, w_mm, h_mm, ppm):
        self.name, self.w, self.h = name, w_mm, h_mm
        self.res = (int(round(w_mm * ppm)), int(round(h_mm * ppm)))
        self.scene = bpy.data.scenes.new("mask_" + name)
        self.mat = bpy.data.materials.new("mask_white")
        nb = NodeBuilder(self.mat)
        out = nb.node("ShaderNodeOutputMaterial")
        em = nb.node("ShaderNodeEmission")
        em.inputs["Strength"].default_value = 1.0
        nb.set(out.inputs["Surface"], em.outputs[0])
        self.objs = []

    def _link(self, ob):
        self.scene.collection.objects.link(ob)
        self.objs.append(ob)
        return ob

    def text(self, s, x, y, size, fnt=None, align="CENTER", bold=0.0, spacing=1.0, rot=0.0,
             shear=0.0, valign="BOTTOM_BASELINE"):
        cu = bpy.data.curves.new("txt", "FONT")
        cu.body = s
        if fnt is not None:
            cu.font = fnt
        cu.size = size
        cu.align_x = align
        cu.align_y = valign
        cu.offset = bold
        cu.space_character = spacing
        cu.shear = shear
        cu.materials.append(self.mat)
        ob = bpy.data.objects.new("txt", cu)
        ob.location = (x, y, 0.0)
        ob.rotation_euler[2] = rot
        return self._link(ob)

    def poly(self, pts):
        me = bpy.data.meshes.new("poly")
        me.from_pydata([(p[0], p[1], 0.0) for p in pts], [], [list(range(len(pts)))])
        me.materials.append(self.mat)
        return self._link(bpy.data.objects.new("poly", me))

    def rect(self, x0, y0, x1, y1):
        return self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

    def frame(self, x0, y0, x1, y1, w):
        self.rect(x0, y0, x1, y0 + w)
        self.rect(x0, y1 - w, x1, y1)
        self.rect(x0, y0, x0 + w, y1)
        self.rect(x1 - w, y0, x1, y1)

    def disc(self, cx, cy, r, n=20):
        self.poly([(cx + r * cos(2 * pi * k / n), cy + r * sin(2 * pi * k / n)) for k in range(n)])

    def strokes(self, lines, width):
        cu = bpy.data.curves.new("strokes", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = width / 2
        cu.bevel_resolution = 3
        cu.use_fill_caps = True
        for pts in lines:
            if len(pts) < 2:
                continue
            sp = cu.splines.new("POLY")
            sp.points.add(len(pts) - 1)
            for k, p in enumerate(pts):
                sp.points[k].co = (p[0], p[1], 0.0, 1.0)
        cu.materials.append(self.mat)
        self._link(bpy.data.objects.new("strokes", cu))
        for pts in lines:
            for p in (pts[0], pts[-1]):
                self.disc(p[0], p[1], width / 2, 12)

    def render(self, path):
        scn = self.scene
        scn.render.engine = "CYCLES"
        scn.cycles.device = "GPU"
        scn.cycles.samples = 16
        scn.cycles.use_denoising = False
        scn.render.resolution_x, scn.render.resolution_y = self.res
        scn.render.resolution_percentage = 100
        scn.render.filter_size = 1.0
        scn.view_settings.view_transform = "Standard"
        scn.view_settings.look = "None"
        w = bpy.data.worlds.new("mask_world")
        try:
            w.use_nodes = True
            w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
        except Exception:
            w.color = (0, 0, 0)
        scn.world = w
        cd = bpy.data.cameras.new("mask_cam")
        cd.type = "ORTHO"
        cd.ortho_scale = max(self.w, self.h)
        cd.clip_end = 1000.0
        cam = bpy.data.objects.new("mask_cam", cd)
        cam.location = (self.w / 2, self.h / 2, 100.0)
        scn.collection.objects.link(cam)
        scn.camera = cam
        scn.render.image_settings.file_format = "PNG"
        scn.render.image_settings.color_mode = "BW"
        scn.render.image_settings.color_depth = "8"
        scn.render.filepath = path
        bpy.ops.render.render(write_still=True, scene=scn.name)
        for ob in self.objs + [cam]:
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.scenes.remove(scn)
        bpy.data.worlds.remove(w)
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = "Non-Color"
        return img


# Single-stroke handwriting glyphs (x-height = 1, baseline 0)
GLYPHS = {
    "a": (0.95, [[(0.78, 0.72), (0.55, 0.95), (0.25, 0.88), (0.06, 0.55), (0.12, 0.15), (0.38, 0.0),
                  (0.62, 0.18), (0.76, 0.62)], [(0.8, 0.97), (0.76, 0.35), (0.8, 0.06), (0.95, 0.02)]]),
    "s": (0.72, [[(0.66, 0.82), (0.42, 0.97), (0.16, 0.86), (0.18, 0.6), (0.48, 0.46), (0.64, 0.24),
                  (0.5, 0.03), (0.2, 0.0), (0.04, 0.14)]]),
    "k": (0.74, [[(0.12, 1.72), (0.1, 0.0)], [(0.62, 0.95), (0.14, 0.42)], [(0.3, 0.56), (0.68, 0.0)]]),
    "m": (1.05, [[(0.06, 0.95), (0.08, 0.0)], [(0.08, 0.62), (0.24, 0.93), (0.42, 0.88), (0.47, 0.5),
                  (0.47, 0.0)], [(0.47, 0.62), (0.64, 0.93), (0.82, 0.88), (0.87, 0.5), (0.88, 0.0)]]),
    "e": (0.8, [[(0.08, 0.48), (0.68, 0.56), (0.62, 0.86), (0.36, 0.98), (0.1, 0.8), (0.04, 0.4),
                 (0.2, 0.07), (0.46, 0.0), (0.72, 0.14)]]),
    "n": (0.8, [[(0.07, 0.95), (0.08, 0.0)], [(0.08, 0.62), (0.28, 0.94), (0.54, 0.9), (0.63, 0.5),
                 (0.64, 0.0)]]),
    "y": (0.8, [[(0.04, 0.95), (0.14, 0.32), (0.34, 0.05), (0.58, 0.3), (0.68, 0.95)],
                [(0.68, 0.95), (0.63, 0.05), (0.52, -0.5), (0.28, -0.7), (0.06, -0.56)]]),
    "t": (0.62, [[(0.3, 1.42), (0.28, 0.2), (0.38, 0.0), (0.58, 0.06)], [(0.04, 0.9), (0.6, 0.96)]]),
    "h": (0.8, [[(0.1, 1.72), (0.08, 0.0)], [(0.08, 0.62), (0.3, 0.94), (0.56, 0.9), (0.64, 0.5),
                 (0.65, 0.0)]]),
    "i": (0.36, [[(0.16, 0.95), (0.15, 0.0)], [(0.17, 1.33), (0.19, 1.37)]]),
    "g": (0.8, [[(0.66, 0.8), (0.42, 0.97), (0.16, 0.86), (0.05, 0.5), (0.18, 0.14), (0.44, 0.08),
                 (0.66, 0.36)], [(0.7, 0.97), (0.67, 0.0), (0.56, -0.5), (0.3, -0.7), (0.06, -0.56)]]),
    "!": (0.42, [[(0.2, 1.72), (0.15, 0.45)], [(0.13, 0.05), (0.15, 0.08)]]),
    " ": (0.5, []),
}


def catmull(pts, sub=6):
    if len(pts) < 3:
        return pts
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for k in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[k - 1], P[k], P[k + 1], P[k + 2]
        for s in range(sub):
            t = s / sub
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t +
                                    (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
                                    (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3) for i in range(2)))
    out.append(pts[-1])
    return out


def handwriting(text, x, y, xh, rng, slant=0.2, rot=0.0):
    """Return stroke polylines for a line of handwriting."""
    lines = []
    cx = 0.0
    ca, sa = cos(rot), sin(rot)
    for ch in text:
        adv, strokes = GLYPHS[ch]
        sc = xh * (1.0 + rng.uniform(-0.06, 0.06))
        dy = rng.uniform(-0.06, 0.06) * xh
        for st in strokes:
            pts = [(p[0] + rng.uniform(-0.02, 0.02), p[1] + rng.uniform(-0.02, 0.02)) for p in st]
            pts = catmull(pts)
            out = []
            for px, py in pts:
                lx = cx + (px + slant * py) * sc
                ly = py * sc + dy
                out.append((x + ca * lx - sa * ly, y + sa * lx + ca * ly))
            lines.append(out)
        cx += adv * sc * 1.02
    return lines


def make_masks(build_dir, screen_mask=False):
    os.makedirs(build_dir, exist_ok=True)
    inter = font("Inter.woff2")
    mono = font("DejaVuSansMono.woff2")
    masks = {}
    rng = random.Random(SEED)

    # chin print (planar decal over the chin strip)
    x0, z0, w, h = CHIN_DECAL
    c = MaskCanvas("chin", w * 1000, h * 1000, 8.0)
    yb = (Z_CTRL - 0.0245 - z0) * 1000
    for label, xx in (("BRIGHTNESS", KNOB_B_X), ("CONTRAST", KNOB_C_X), ("POWER", BTN_X - 0.0075)):
        c.text(label, (xx - x0) * 1000, yb, 2.9, inter, bold=0.03, spacing=1.18)
    masks["chin"] = c.render(os.path.join(build_dir, "mask_chin.png"))

    # charcoal paint: knob pointer line (left half) + power symbol (right half)
    c = MaskCanvas("charcoal", 40.0, 20.0, 40.0)
    # knob decal maps the knob face (diameter 2*0.0133 m) onto [0,20]x[0,20] mm
    c.strokes([[(10.0, 10.0 + 3.3), (10.0, 10.0 + 8.2)]], 0.95)
    # power symbol in the right half; button decal maps 24 mm -> 20 mm
    s = 20.0 / 24.0
    cxp, cyp, rr = 30.0, 10.0, 3.6 * s
    arc_pts = [(cxp + rr * sin(a), cyp + rr * cos(a))
               for a in np.linspace(math.radians(40), math.radians(320), 40)]
    c.strokes([arc_pts, [(cxp, cyp + 0.6 * s), (cxp, cyp + 4.6 * s)]], 0.95 * s)
    masks["charcoal"] = c.render(os.path.join(build_dir, "mask_charcoal.png"))

    # badge: metal rim, big "80-25", small line
    c = MaskCanvas("badge", 78.0, 27.0, 16.0)
    c.frame(0.0, 0.0, 78.0, 27.0, 1.25)
    c.text("80·25", 39.0, 9.8, 15.5, inter, bold=0.42, spacing=1.05)
    c.rect(9.0, 7.4, 69.0, 7.85)
    c.text("MONOCHROME  DATA  DISPLAY", 39.0, 3.1, 2.75, inter, bold=0.05, spacing=1.22)
    masks["badge"] = c.render(os.path.join(build_dir, "mask_badge.png"))

    # screw cross recess (decal spans the screw head diameter)
    c = MaskCanvas("screw", 10.0, 10.0, 40.0)
    c.rect(5.0 - 0.4, 5.0 - 2.6, 5.0 + 0.4, 5.0 + 2.6)
    c.rect(5.0 - 2.6, 5.0 - 0.4, 5.0 + 2.6, 5.0 + 0.4)
    masks["screw"] = c.render(os.path.join(build_dir, "mask_screw.png"))

    # rear rating label
    c = MaskCanvas("label", 82.0, 50.0, 12.0)
    c.frame(1.6, 1.6, 80.4, 48.4, 0.5)
    c.text("MODEL 8025-M", 5.0, 41.0, 5.0, inter, align="LEFT", bold=0.12)
    c.text("MONOCHROME DATA DISPLAY", 5.0, 36.2, 2.6, inter, align="LEFT", bold=0.03, spacing=1.1)
    c.rect(5.0, 34.3, 77.0, 34.6)
    rows = [("INPUT", "120V ~ 60Hz 0.6A"), ("", "230V ~ 50Hz 0.3A"), ("VIDEO", "TTL / 18.4 kHz"),
            ("SER. NO.", "83-104217"), ("MFD.", "OCT 1983")]
    yy = 30.0
    for k, v in rows:
        c.text(k, 5.0, yy, 2.5, inter, align="LEFT", bold=0.03)
        c.text(v, 26.0, yy, 2.5, mono, align="LEFT")
        yy -= 3.6
    c.rect(5.0, 11.0, 77.0, 11.3)
    c.text("CAUTION: RISK OF ELECTRIC SHOCK. DO NOT OPEN.", 41.0, 7.4, 2.05, inter, bold=0.04)
    c.text("NO USER-SERVICEABLE PARTS INSIDE.", 41.0, 4.3, 2.05, inter, bold=0.02)
    c.frame(66.0, 15.0, 76.0, 25.0, 0.5)          # generic double-insulation symbol
    c.frame(68.4, 17.4, 73.6, 22.6, 0.5)
    masks["label"] = c.render(os.path.join(build_dir, "mask_label.png"))

    # asset tag: text + barcode
    c = MaskCanvas("tag", 44.0, 17.0, 20.0)
    c.text("PROPERTY OF DATA PROCESSING", 22.0, 13.4, 1.9, inter, bold=0.03, spacing=1.08)
    x = 5.0
    brng = random.Random(SEED + 7)
    while x < 39.0:
        wbar = brng.choice((0.25, 0.25, 0.5, 0.75))
        c.rect(x, 4.3, x + wbar, 11.6)
        x += wbar + brng.choice((0.25, 0.5, 0.5, 0.75))
    c.text("No. 004217", 22.0, 1.4, 2.3, mono, bold=0.02)
    masks["tag"] = c.render(os.path.join(build_dir, "mask_tag.png"))

    # sticky note handwriting
    c = MaskCanvas("paper", 52.0, 52.0, 20.0)
    lines = handwriting("ask me", 7.0, 31.0, 6.4, rng, rot=math.radians(4))
    lines += handwriting("anything!", 4.0, 15.5, 6.4, rng, rot=math.radians(2))
    lines.append(catmull([(9.0, 11.0), (22.0, 9.6), (40.0, 10.8)]))
    c.strokes(lines, 0.95)
    masks["paper"] = c.render(os.path.join(build_dir, "mask_paper.png"))

    if screen_mask:
        masks["screen"] = make_screen_mask(build_dir, mono)
    return masks


SCREEN_LINES = [
    "80-25 MONOCHROME DATA DISPLAY                          FIRMWARE REV 2.1  (C) 1983",
    "MEMORY TEST ........ 64K OK       CHARACTER ROM ........ OK      LINE ......... 9600",
    "",
    "READY.",
    "",
    "> HELLO",
    "",
    "  HI! I AM A TERMINAL FROM 1983, SOMEHOW STILL CONNECTED TO THE INTERNET.",
    "  TYPE A QUESTION AND PRESS RETURN.  I WILL DO MY BEST TO ANSWER.",
    "",
    "> WHAT ARE YOU MADE OF?",
    "",
    "  MOSTLY BEIGE PLASTIC, A 12-INCH P1 PHOSPHOR TUBE AND A LOT OF OPTIMISM.",
    "",
    "> _",
]


def make_screen_mask(build_dir, mono):
    """Phosphor text for the preview renders (canvas = full glass mesh UV space)."""
    cw, ch = GW * 1000, GH * 1000
    c = MaskCanvas("screen", cw, ch, 2048 / cw)
    x_left = (GW - OW) / 2 * 1000 + 0.045 * OW * 1000
    top = ch - ((GH - OH) / 2 * 1000 + 0.06 * OH * 1000)
    row_h = OH * 1000 * 0.88 / 25
    cell = OW * 1000 * 0.91 / 80
    size = cell / 0.602
    for k, line in enumerate(SCREEN_LINES):
        if line:
            c.text(line, x_left, top - (k + 1) * row_h, size, mono, align="LEFT", bold=0.04)
    k = SCREEN_LINES.index("> _")
    y = top - (k + 1) * row_h
    c.rect(x_left + 2 * cell, y - 0.25 * row_h, x_left + 3 * cell, y + 0.62 * row_h)
    return c.render(os.path.join(build_dir, "mask_screen.png"))


# =============================================================================
# Objects
# =============================================================================
LOOP_NORMALS = {}


def make_object(name, mb, location=(0.0, 0.0, 0.0), mat_names=None):
    """Create a mesh object from a MeshBuilder (vertex coordinates are local)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(mb.co, [], [list(f) for f in mb.faces])
    names = mat_names or sorted(set(mb.fmat), key=lambda n: (n != "beige", n))
    for nm in names:
        me.materials.append(BakeMat.registry[nm].mat if nm in BakeMat.registry else bpy.data.materials[nm])
    me.polygons.foreach_set("material_index", [names.index(m) for m in mb.fmat])
    me.polygons.foreach_set("use_smooth", [True] * len(mb.faces))
    at = me.attributes.new("dens", "FLOAT", "FACE")
    at.data.foreach_set("value", mb.fdens)
    me.uv_layers.new(name="UVMap")
    dl = me.uv_layers.new(name="Decal")
    nl = len(me.loops)
    lv = np.empty(nl, dtype=np.int32)
    me.loops.foreach_get("vertex_index", lv)
    dec = np.array(mb.dec, dtype=np.float32)
    dl.data.foreach_set("uv", dec[lv].ravel())
    me.uv_layers.active = me.uv_layers["UVMap"]
    me.uv_layers["UVMap"].active_render = True
    # loop normals: exact surface normals, face normals for flat faces
    vn = np.array(mb.vn, dtype=np.float64)
    ln = vn[lv]
    me.update()
    fn = np.empty(len(me.polygons) * 3)
    me.polygons.foreach_get("normal", fn)
    fn = fn.reshape(-1, 3)
    ls = np.empty(len(me.polygons), dtype=np.int32)
    lt = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("loop_start", ls)
    me.polygons.foreach_get("loop_total", lt)
    for p, flat in enumerate(mb.fflat):
        if flat:
            ln[ls[p]:ls[p] + lt[p]] = fn[p]
    LOOP_NORMALS[name] = ln
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = location
    return ob


def apply_normals(ob):
    ln = LOOP_NORMALS[ob.name]
    ob.data.normals_split_custom_set([tuple(v) for v in ln])


def check_normals(ob):
    """Fraction of face corners whose custom normal disagrees with the face winding."""
    me = ob.data
    fn = np.empty(len(me.polygons) * 3)
    me.polygons.foreach_get("normal", fn)
    fn = fn.reshape(-1, 3)
    lt = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("loop_total", lt)
    ln = LOOP_NORMALS[ob.name]
    face_of_loop = np.repeat(np.arange(len(lt)), lt)
    d = np.einsum("ij,ij->i", ln, fn[face_of_loop])
    return float((d < 0.0).mean()), float((d < 0.5).mean())


def build_objects():
    body = MeshBuilder()
    build_bezel(body)
    build_surround(body)
    build_housing(body)
    build_pedestal(body)
    build_collar(body)
    build_badge(body)
    build_led_ring(body)
    build_rear_details(body)
    build_asset_tag(body)
    build_sticky_note(body)
    objs = {"Body": make_object("Body", body)}
    objs["PowerButton"] = make_object("PowerButton", build_power_button(), (BTN_X, YF - BTN_OUT, Z_CTRL))
    for name, x in (("KnobBrightness", KNOB_B_X), ("KnobContrast", KNOB_C_X)):
        objs[name] = make_object(name, knob_builder(), (x, YF, Z_CTRL))
    objs["PowerLED"] = make_object("PowerLED", build_led(), (LED_X, YF, Z_CTRL))
    # glass
    co, nrm, uv, faces = build_screen()
    org = np.array((0.0, Y_GLASS, ZO))
    me = bpy.data.meshes.new("Screen")
    me.from_pydata((np.array(co) - org).tolist(), [], faces)
    me.materials.append(bpy.data.materials["Screen"])
    me.polygons.foreach_set("use_smooth", [True] * len(faces))
    uvl = me.uv_layers.new(name="UVMap")
    lv = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", lv)
    uvl.data.foreach_set("uv", np.array(uv, dtype=np.float32)[lv].ravel())
    me.update()
    LOOP_NORMALS["Screen"] = np.array(nrm)[lv]
    ob = bpy.data.objects.new("Screen", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = tuple(org)
    objs["Screen"] = ob
    return objs


# knob pointer orientation (decal rotation) per knob, degrees clockwise from 12 o'clock
KNOB_POINTER = {"KnobBrightness": 38.0, "KnobContrast": -24.0}


def knob_decals(ob):
    """Map the knob faces into the left half of the charcoal paint mask, rotated."""
    rk = KNOB_R
    ang = math.radians(KNOB_POINTER[ob.name])
    me = ob.data
    lv = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", lv)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    x, z = co[:, 0], co[:, 2]
    xr = x * cos(ang) - z * sin(ang)
    zr = x * sin(ang) + z * cos(ang)
    u = 0.25 + xr / (4 * rk)
    v = 0.5 + zr / (2 * rk)
    front = co[:, 1] < -(KNOB_H - 0.005)  # only the front part of the knob
    u = np.where(front, u, -10.0)
    uv = np.stack([u, v], 1)[lv]
    me.uv_layers["Decal"].data.foreach_set("uv", uv.astype(np.float32).ravel())


def button_decals(ob):
    me = ob.data
    lv = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", lv)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    u = 0.75 + co[:, 0] / (4 * BTN_HALF)
    v = 0.5 + co[:, 2] / (2 * BTN_HALF)
    u = np.where(co[:, 1] < 0.0015, u, -10.0)
    me.uv_layers["Decal"].data.foreach_set("uv", np.stack([u, v], 1)[lv].astype(np.float32).ravel())


# =============================================================================
# UV atlas
# =============================================================================
def normalize_island_density(ob):
    """Scale every UV island so texel density = its (area weighted) 'dens' attribute."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv["UVMap"]
    dl = bm.faces.layers.float.get("dens")
    bm.faces.ensure_lookup_table()
    parent = list(range(len(bm.faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for e in bm.edges:
        if len(e.link_loops) != 2:
            continue
        l1, l2 = e.link_loops
        a1, b1 = l1[uvl].uv, l1.link_loop_next[uvl].uv
        if l2.vert == l1.vert:
            a2, b2 = l2[uvl].uv, l2.link_loop_next[uvl].uv
        else:
            a2, b2 = l2.link_loop_next[uvl].uv, l2[uvl].uv
        if (a1 - a2).length < 1e-6 and (b1 - b2).length < 1e-6:
            ra, rb = find(l1.face.index), find(l2.face.index)
            if ra != rb:
                parent[ra] = rb
    islands = {}
    for f in bm.faces:
        islands.setdefault(find(f.index), []).append(f)
    for faces in islands.values():
        a3 = sum(f.calc_area() for f in faces)
        auv = 0.0
        for f in faces:
            uvs = [l[uvl].uv for l in f.loops]
            s = 0.0
            for k in range(len(uvs)):
                p, q = uvs[k], uvs[(k + 1) % len(uvs)]
                s += p.x * q.y - q.x * p.y
            auv += abs(s) * 0.5
        if auv < 1e-14 or a3 < 1e-14:
            continue
        dens = sum(f[dl] * f.calc_area() for f in faces) / a3
        s = sqrt(a3 / auv) * dens
        us = [l[uvl].uv.copy() for f in faces for l in f.loops]
        cx = sum(u.x for u in us) / len(us)
        cy = sum(u.y for u in us) / len(us)
        for f in faces:
            for l in f.loops:
                uv = l[uvl].uv
                l[uvl].uv = ((uv.x - cx) * s + cx, (uv.y - cy) * s + cy)
    bm.to_mesh(me)
    bm.free()


def build_atlas(objs, margin=0.0035):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(56), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:
        normalize_island_density(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, rotate_method="ANY", scale=True,
                            margin_method="FRACTION", margin=margin, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")


# =============================================================================
# Baking
# =============================================================================
def setup_gpu():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    ok = False
    for dev in ("METAL", "NONE"):
        try:
            prefs.compute_device_type = dev
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type != "CPU" or dev == "NONE"
            ok = dev != "NONE"
            break
        except Exception:
            continue
    return ok


def bake_atlas(atlas_objs, size):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "GPU" if GPU else "CPU"
    scn.render.bake.margin = 10
    scn.render.bake.margin_type = "EXTEND"
    scn.render.bake.use_clear = True
    scn.render.bake.target = "IMAGE_TEXTURES"
    # desk plane: occludes the underside for AO / grime like the real object on a desk
    me = bpy.data.meshes.new("bake_floor")
    me.from_pydata([(-2, -2, 0), (2, -2, 0), (2, 2, 0), (-2, 2, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("bake_floor", me)
    scn.collection.objects.link(floor)
    imgs = {}
    for key, btype, samples in (("COLOR", "EMIT", 64), ("ORM", "EMIT", 64), ("NORMAL", "NORMAL", 16)):
        img = bpy.data.images.new("bake_" + key, size, size, alpha=False, float_buffer=True)
        img.colorspace_settings.name = "Non-Color"
        for bmat in BakeMat.registry.values():
            bmat.mode(key)
            bmat.set_target(img)
        scn.cycles.samples = samples
        bpy.ops.object.select_all(action="DESELECT")
        for o in atlas_objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = atlas_objs[0]
        t0 = time.time()
        bpy.ops.object.bake(type=btype, normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y",
                            normal_b="POS_Z", margin=10, margin_type="EXTEND", use_clear=True)
        log("baked", key, "%.1fs" % (time.time() - t0))
        imgs[key] = img
    for bmat in BakeMat.registry.values():
        bmat.mode("RENDER")
    bpy.data.objects.remove(floor, do_unlink=True)
    return imgs


def img_array(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def save_png(name, rgb_arr, path, srgb):
    h, w = rgb_arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
    rng = np.random.default_rng(SEED)
    q = np.clip(rgb_arr + rng.uniform(-0.5, 0.5, rgb_arr.shape) / 255.0, 0.0, 1.0)
    q = np.round(q * 255.0) / 255.0
    rgba = np.concatenate([q, np.ones((h, w, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.filepath = path
    return img


def write_textures(imgs, tex_dir):
    os.makedirs(tex_dir, exist_ok=True)
    col = img_array(imgs["COLOR"])[..., :3]
    col = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(np.clip(col, 0, None), 1 / 2.4) - 0.055)
    orm = img_array(imgs["ORM"])[..., :3]
    nrm = img_array(imgs["NORMAL"])[..., :3]
    out = {
        "baseColor": save_png("Body_baseColor", col, os.path.join(tex_dir, "body_basecolor.png"), True),
        "orm": save_png("Body_ORM", orm, os.path.join(tex_dir, "body_orm.png"), False),
        "normal": save_png("Body_normal", nrm, os.path.join(tex_dir, "body_normal.png"), False),
    }
    for img in imgs.values():
        bpy.data.images.remove(img)
    return out


def gltf_output_group():
    ng = bpy.data.node_groups.get("glTF Material Output")
    if ng is None:
        ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        ng.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        ng.interface.new_socket("Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    return ng


def make_body_material(tex):
    mat = bpy.data.materials.new("Body")
    mat.use_backface_culling = True
    nb = NodeBuilder(mat)
    out = nb.node("ShaderNodeOutputMaterial")
    b = nb.node("ShaderNodeBsdfPrincipled")
    uv = nb.node("ShaderNodeUVMap", uv_map="UVMap")
    tc = nb.node("ShaderNodeTexImage", image=tex["baseColor"])
    to = nb.node("ShaderNodeTexImage", image=tex["orm"])
    tn = nb.node("ShaderNodeTexImage", image=tex["normal"])
    for t in (tc, to, tn):
        nb.set(t.inputs["Vector"], uv.outputs["UV"])
    sep = nb.node("ShaderNodeSeparateColor")
    nb.set(sep.inputs[0], to.outputs["Color"])
    nm = nb.node("ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
    nb.set(nm.inputs["Color"], tn.outputs["Color"])
    nb.set(b.inputs["Base Color"], tc.outputs["Color"])
    nb.set(b.inputs["Roughness"], sep.outputs["Green"])
    nb.set(b.inputs["Metallic"], sep.outputs["Blue"])
    nb.set(b.inputs["Normal"], nm.outputs["Normal"])
    nb.set(out.inputs["Surface"], b.outputs[0])
    g = nb.node("ShaderNodeGroup")
    g.node_tree = gltf_output_group()
    nb.set(g.inputs["Occlusion"], sep.outputs["Red"])
    return mat


def finalize_atlas_objects(objs, body_mat):
    for ob in objs:
        me = ob.data
        me.materials.clear()
        me.materials.append(body_mat)
        me.polygons.foreach_set("material_index", [0] * len(me.polygons))
        if "Decal" in me.uv_layers:
            me.uv_layers.remove(me.uv_layers["Decal"])
        if "dens" in me.attributes:
            me.attributes.remove(me.attributes["dens"])


def finalize_led(ob):
    """LED lens: planar front UVs, no helper layers."""
    me = ob.data
    if "Decal" in me.uv_layers:
        me.uv_layers.remove(me.uv_layers["Decal"])
    if "dens" in me.attributes:
        me.attributes.remove(me.attributes["dens"])
    lv = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", lv)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    uv = np.stack([0.5 + co[:, 0] / 0.0064, 0.5 + co[:, 2] / 0.0064], 1)[lv]
    me.uv_layers["UVMap"].data.foreach_set("uv", uv.astype(np.float32).ravel())


def export_glb(path, objs, quality=82, tangents=False):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_texcoords=True, export_normals=True, export_tangents=tangents,
        export_materials="EXPORT", export_image_format="WEBP", export_image_quality=quality,
        export_image_add_webp=False, export_image_webp_fallback=False,
        export_cameras=False, export_lights=False, export_animations=False, export_extras=False,
        export_attributes=False, export_skins=False, export_morph=False)
    return os.path.getsize(path)


# =============================================================================
# Preview renders
# =============================================================================
def phosphor_material(mask_img):
    """Preview-only screen: dark glass + green phosphor text glow + reflections."""
    a = img_array(mask_img)[..., 0]
    h, w = a.shape

    def blur(x, sigma):
        r = int(sigma * 3)
        k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
        k /= k.sum()
        y = np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), 0, x)
        return np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), 1, y)
    small = a[::2, ::2]
    halo = np.kron(blur(small, 2.5), np.ones((2, 2)))[:h, :w]
    wide = np.kron(blur(small, 12.0), np.ones((2, 2)))[:h, :w]
    glow = a * 1.0 + halo * 0.45 + wide * 0.18
    # faint raster background inside the visible opening
    yy, xx = np.mgrid[0:h, 0:w]
    u = (xx + 0.5) / w
    v = (yy + 0.5) / h
    du = np.clip((np.abs(u - 0.5) - (OW / GW / 2 - 0.035)) / 0.035, 0, 1)
    dv = np.clip((np.abs(v - 0.5) - (OH / GH / 2 - 0.045)) / 0.045, 0, 1)
    raster = 1.0 - np.clip(du + dv, 0, 1)
    glow += 0.0025 * raster
    vign = 1.0 - 0.35 * (((u - 0.5) * 2) ** 2 + ((v - 0.5) * 2) ** 2) ** 1.5
    glow *= vign
    img = bpy.data.images.new("phosphor", w, h, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    rgba = np.stack([glow, glow, glow, np.ones_like(glow)], 2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    m = bpy.data.materials.new("Screen_phosphor")
    nb = NodeBuilder(m)
    out = nb.node("ShaderNodeOutputMaterial")
    b = nb.node("ShaderNodeBsdfPrincipled")
    uvn = nb.node("ShaderNodeUVMap", uv_map="UVMap")
    t = nb.node("ShaderNodeTexImage", image=img, extension="CLIP", interpolation="Cubic")
    nb.set(t.inputs["Vector"], uvn.outputs["UV"])
    b.inputs["Base Color"].default_value = rgb((44, 50, 48))
    b.inputs["Roughness"].default_value = 0.45
    b.inputs["Specular IOR Level"].default_value = 0.0
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.025
    b.inputs["Coat IOR"].default_value = 1.52
    b.inputs["Emission Color"].default_value = (0.10, 1.0, 0.22, 1.0)
    nb.set(b.inputs["Emission Strength"], nb.math("MULTIPLY", t.outputs["Color"], 12.0))
    nb.set(out.inputs["Surface"], b.outputs[0])
    return m


def reflector_card():
    """Soft gradient 'softbox' seen only in reflections (camera/diffuse invisible)."""
    me = bpy.data.meshes.new("card")
    w, h = 1.4, 0.8
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)],
                   [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", [0, 0, 1, 0, 1, 1, 0, 1])
    ob = bpy.data.objects.new("card", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.visible_camera = False
    ob.visible_diffuse = False
    ob.visible_shadow = False
    mat = bpy.data.materials.new("card")
    nb = NodeBuilder(mat)
    out = nb.node("ShaderNodeOutputMaterial")
    em = nb.node("ShaderNodeEmission")
    tc = nb.node("ShaderNodeTexCoord")
    s = nb.sep(tc.outputs["UV"])
    g = nb.math("MULTIPLY", nb.smooth(s["Y"], 0.0, 1.0), nb.smooth(nb.math("PINGPONG", s["X"], 0.5), 0.0, 0.18))
    nb.set(em.inputs["Strength"], nb.math("MULTIPLY", g, 1.6))
    nb.set(out.inputs["Surface"], em.outputs[0])
    me.materials.append(mat)
    return ob


# per view: reflector card location and the point it faces
CARDS = {
    "front": ((0.15, -2.4, 0.95), (0.0, -0.16, 0.25)),
    "corner": ((1.25, -1.45, 0.38), (0.0, -0.16, 0.25)),
}


def make_backdrop():
    """Photo studio sweep: floor + curved back wall (local +Y is 'behind')."""
    co, faces = [], []
    xs = [-3.0, 3.0]
    prof = []
    for k in range(6):
        prof.append((-3.0 + k * 0.7, 0.0))
    R = 0.9
    for k in range(1, 13):
        a = k / 12 * pi / 2
        prof.append((0.6 + R * sin(a), R - R * cos(a)))
    prof.append((0.6 + R, 3.5))
    for p in prof:
        for x in xs:
            co.append((x, p[0], p[1]))
    for k in range(len(prof) - 1):
        a = 2 * k
        faces.append((a, a + 1, a + 3, a + 2))
    me = bpy.data.meshes.new("backdrop")
    me.from_pydata(co, [], faces)
    me.polygons.foreach_set("use_smooth", [True] * len(faces))
    ob = bpy.data.objects.new("backdrop", me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new("backdrop")
    nb = NodeBuilder(mat)
    out = nb.node("ShaderNodeOutputMaterial")
    b = nb.node("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = rgb((92, 90, 88))
    b.inputs["Roughness"].default_value = 0.85
    nb.set(out.inputs["Surface"], b.outputs[0])
    me.materials.append(mat)
    return ob


VIEWS = {
    # name: (camera location, target, focal length mm, backdrop rotation deg)
    "corner": ((-0.95, -1.55, 0.98), (0.015, 0.0, 0.205), 74.0, -32.0),
    "front": ((0.0, -1.05, ZO), (0.0, 0.0, ZO), 92.0, 0.0),
    "side": ((-1.75, 0.03, 0.26), (0.0, 0.03, 0.205), 56.0, -90.0),
    "back": ((1.05, 1.45, 0.82), (0.0, 0.05, 0.19), 60.0, 145.0),
    # close-ups for inspection only
    "chin": ((-0.12, -0.62, 0.30), (0.05, -0.17, 0.10), 85.0, -10.0),
    "tl": ((-0.25, -0.55, 0.50), (-0.14, -0.16, 0.36), 90.0, -20.0),
    "top": ((-0.35, -0.35, 1.05), (0.0, 0.08, 0.30), 55.0, -30.0),
    "base": ((-0.45, -0.75, 0.20), (0.0, -0.05, 0.05), 70.0, -30.0),
}


def render_previews(args, objs):
    from mathutils import Vector
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "GPU" if GPU else "CPU"
    scn.cycles.samples = args.samples
    scn.cycles.use_denoising = True
    try:
        scn.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    scn.cycles.max_bounces = 8
    scn.cycles.glossy_bounces = 4
    scn.cycles.diffuse_bounces = 4
    rx, ry = (int(v) for v in args.res.split("x"))
    scn.render.resolution_x, scn.render.resolution_y = rx, ry
    scn.render.resolution_percentage = 100
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGB"
    for vt in ("Khronos PBR Neutral", "AgX"):
        try:
            scn.view_settings.view_transform = vt
            break
        except Exception:
            continue
    scn.view_settings.exposure = EXPOSURE
    # world HDRI
    w = bpy.data.worlds.new("studio")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(
        bpy.utils.system_resource("DATAFILES", path="studiolights/world"), "studio.exr"))
    mp = nt.nodes.new("ShaderNodeMapping")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    mp.inputs["Rotation"].default_value = (0, 0, math.radians(120))
    nt.links.new(mp.outputs[0], env.inputs["Vector"])
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.35
    nt.links.new(env.outputs[0], bg.inputs["Color"])
    wo = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], wo.inputs["Surface"])
    scn.world = w
    # lights
    def area(name, loc, target, size, power, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.size = size
        ld.energy = power
        ld.color = color
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        d = Vector(target) - Vector(loc)
        o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scn.collection.objects.link(o)
        return o
    area("key", (-1.3, -1.5, 1.6), (0, 0, 0.2), 1.3, 105.0, (1.0, 0.985, 0.96))
    area("rim", (1.1, 1.3, 1.3), (0, 0, 0.25), 1.0, 110.0, (0.92, 0.96, 1.0))
    area("fill", (1.6, -1.2, 0.6), (0, 0, 0.2), 1.5, 30.0, (0.95, 0.97, 1.0))
    card = reflector_card()
    back = make_backdrop()
    # preview-only phosphor screen
    if "screen" in MASKS:
        objs["Screen"].data.materials[0] = phosphor_material(MASKS["screen"])
    cd = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cd.sensor_width = 36.0
    cd.clip_start = 0.05
    for view in args.views.split(","):
        loc, tgt, focal, brot = VIEWS[view]
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        cd.lens = focal
        back.rotation_euler = (0, 0, math.radians(brot))
        cl, ct = CARDS.get(view, ((0, 5, -5), (0, 6, -5)))
        card.location = cl
        dd = Vector(ct) - Vector(cl)
        card.rotation_euler = dd.to_track_quat("Z", "Y").to_euler()
        scn.render.filepath = os.path.join(args.preview_out or args.out, "preview_%s.png" % view)
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        log("rendered", view, "%.1fs" % (time.time() - t0))


# =============================================================================
# Main
# =============================================================================
MASKS = {}
GPU = False
EXPOSURE = -0.6


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--render", action="store_true")
    p.add_argument("--no-bake", action="store_true")
    p.add_argument("--views", default="corner,front,side,back")
    p.add_argument("--samples", type=int, default=256)
    p.add_argument("--res", default="1200x900")
    p.add_argument("--tex", type=int, default=2048)
    p.add_argument("--quality", type=int, default=82)
    p.add_argument("--tangents", action="store_true")
    p.add_argument("--out", default=HERE, help="where monitor.glb goes")
    p.add_argument("--work", default=os.path.join(tempfile.gettempdir(), "monitor-build"),
                   help="intermediates, textures, monitor.blend and previews")
    p.add_argument("--preview-out", default=None, help="directory for preview renders")
    return p.parse_args(argv)


def main():
    global GPU, MASKS
    args = parse_args()
    out = os.path.abspath(args.out)
    work = os.path.abspath(args.work)
    args.out = out
    args.preview_out = args.preview_out or work
    build_dir = os.path.join(work, "build")
    tex_dir = os.path.join(work, "textures")
    os.makedirs(out, exist_ok=True)
    os.makedirs(work, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0      # no .blend1 backups
    GPU = setup_gpu()
    log("GPU:", GPU)
    MASKS = make_masks(build_dir, screen_mask=args.render)
    log("masks done")
    make_materials(MASKS)
    objs = build_objects()
    knob_decals(objs["KnobBrightness"])
    knob_decals(objs["KnobContrast"])
    button_decals(objs["PowerButton"])
    atlas = [objs[n] for n in ("Body", "PowerButton", "KnobBrightness", "KnobContrast")]
    build_atlas(atlas)
    for ob in objs.values():
        apply_normals(ob)
        bad, weak = check_normals(ob)
        if bad > 0 or weak > 0.01:
            log("  WARNING %s: %.2f%% flipped, %.2f%% >60deg normal/face mismatch" % (ob.name, bad * 100, weak * 100))
    log("geometry + UVs done")
    total = 0
    for n, ob in objs.items():
        tc = tri_count(ob)
        total += tc
        log("  %-15s %6d tris  origin %s" % (n, tc, tuple(round(v, 4) for v in ob.location)))
    log("  total %d tris" % total)
    if not args.no_bake:
        imgs = bake_atlas(atlas, args.tex)
        tex = write_textures(imgs, tex_dir)
        body_mat = make_body_material(tex)
        finalize_atlas_objects(atlas, body_mat)
        finalize_led(objs["PowerLED"])
        glb = os.path.join(out, "monitor.glb")
        export_order = [objs[n] for n in ("Body", "Screen", "PowerButton", "KnobBrightness",
                                          "KnobContrast", "PowerLED")]
        size = export_glb(glb, export_order, args.quality, args.tangents)
        log("exported %s (%.2f MB)" % (glb, size / 1e6))
        for bmat in list(BakeMat.registry.values()):
            bpy.data.materials.remove(bmat.mat)
        BakeMat.registry.clear()
        for img in list(bpy.data.images):
            if img.name.startswith("mask_") or img.users == 0:
                pass
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(work, "monitor.blend"), compress=True)
        log("saved monitor.blend")
    if args.render:
        render_previews(args, objs)
    log("done")


if __name__ == "__main__":
    main()
