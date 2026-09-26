# Gilly's proportions: every shape the body, gills and face are built from.
# Blender coordinates in meters: Z is up, Gilly faces -Y, and +X is Gilly's left.
# Gilly stands about 29 cm tall, a plush-toy size for AR.

import numpy as np

import sdf

# Head: wide and flat like a real axolotl, with chubby cheeks.
HEAD = dict(c=(0.0, -0.004, 0.198), r=(0.101, 0.080, 0.066))
MUZZLE = dict(c=(0.0, -0.030, 0.181), r=(0.082, 0.058, 0.050))
CHEEK = dict(c=(0.058, -0.049, 0.172), r=0.029)

# Body: a small pear under the head.
TORSO = dict(c=(0.0, 0.004, 0.092), r=(0.057, 0.053, 0.066))
BELLY = dict(c=(0.0, -0.020, 0.078), r=0.049)
HIPS = dict(c=(0.0, 0.008, 0.054), r=(0.058, 0.050, 0.038))

# Arms hang in a relaxed A-pose; left side (+X), mirrored for the right.
SHOULDER = np.array([0.052, -0.006, 0.127])
ELBOW = np.array([0.077, -0.013, 0.101])
WRIST = np.array([0.093, -0.020, 0.072])
ARM_R = (0.0185, 0.0158, 0.0142)

# Legs are short stubs.
HIP = np.array([0.036, 0.004, 0.047])
KNEE = np.array([0.042, -0.003, 0.028])
ANKLE = np.array([0.045, -0.007, 0.015])
LEG_R = (0.024, 0.019, 0.015)
FOOT = dict(c=(0.046, -0.021, 0.010), r=(0.019, 0.026, 0.0105))

# Tail: from the lower back to the floor behind, laterally flattened.
TAIL = [(0.0, 0.036, 0.064), (0.0, 0.108, 0.036), (0.0, 0.164, 0.034)]
TAIL_R = (0.030, 0.005)
TAIL_FLAT = 0.64
FIN_HALF_THICKNESS = 0.0017

# Eyes: big, wide-set and low on the face, looking forward and a touch outward.
EYE_R = 0.0228
EYE_DIR = np.array([0.20, -1.0, 0.04])
EYE_AIM = np.array([0.047, -0.040, 0.196])  # A point inside the head the eye ray starts from.
EYE_OUT = 0.57  # How much of the eyeball radius stands out of the skin.
LID_GAP = 0.0008  # Lids slide over the eyeball this far out.
LID_OPEN = dict(upper=-68.0, lower=58.0)  # Rest rotation of each lid, in degrees, from closed.

# Gills: three feathery fronds per side, fanning out behind the cheeks.
GILLS = [
    dict(base=(0.062, 0.030, 0.232), dir=(0.52, 0.40, 0.76), length=0.078, curl=(0.0, 0.45, 0.30)),
    dict(base=(0.078, 0.034, 0.206), dir=(0.84, 0.46, 0.28), length=0.086, curl=(0.0, 0.40, 0.34)),
    dict(base=(0.076, 0.030, 0.180), dir=(0.82, 0.50, -0.28), length=0.072, curl=(0.0, 0.36, 0.26)),
]
GILL_FAN_NORMAL = np.array([0.30, -1.0, 0.0])  # The plane the fringes spread in (left side).


def side(v, s):
    v = np.array(v, np.float64)
    v[0] *= s
    return v


def bounds(points, r):
    pts = np.atleast_2d(np.asarray(points, np.float64))
    return pts.min(0) - r, pts.max(0) + r


def eye_centers():
    """Eyeball centers and look directions, left then right."""
    centers = []
    for s in (1, -1):
        d = side(EYE_DIR, s)
        d = d / np.linalg.norm(d)
        start = side(EYE_AIM, s)
        # March from inside the head along the eye direction to the surface.
        t = np.linspace(0, 0.08, 1600)
        pts = (start[None] + t[:, None] * d[None]).astype(np.float32)
        hit = pts[np.argmax(head_only(pts) > 0)]
        centers.append((hit - d * EYE_R * (1 - EYE_OUT), d))
    return centers


def head_only(p):
    d = sdf.ellipsoid(p, HEAD['c'], HEAD['r'])
    d = sdf.smin(d, sdf.ellipsoid(p, MUZZLE['c'], MUZZLE['r']), 0.03)
    for s in (1, -1):
        d = sdf.smin(d, sdf.sphere(p, side(CHEEK['c'], s), CHEEK['r']), 0.024)
    return d


def body_grid(voxel):
    g = sdf.Grid((-0.150, -0.125, -0.012), (0.150, 0.215, 0.285), voxel)
    eyes = eye_centers()

    def ell(e, k):
        g.apply(lambda p: sdf.ellipsoid(p, e['c'], e['r']), *bounds([e['c']], max(e['r'])), k)

    def sph(c, r, k, op='union'):
        g.apply(lambda p: sdf.sphere(p, c, r), *bounds([c], r), k, op)

    def cone(a, b, r1, r2, k):
        g.apply(lambda p: sdf.round_cone(p, a, b, r1, r2), *bounds([a, b], max(r1, r2)), k)

    def cap(a, b, r, k):
        g.apply(lambda p: sdf.capsule(p, a, b, r), *bounds([a, b], r), k)

    ell(HEAD, 0)
    ell(MUZZLE, 0.03)
    for s in (1, -1):
        sph(side(CHEEK['c'], s), CHEEK['r'], 0.024)
    # Soft rims around the eyes: a sphere set back into the head, so a ring shows.
    for c, d in eyes:
        sph(c - d * 0.0065, EYE_R + 0.0012, 0.008)
    ell(TORSO, 0.035)
    sph(BELLY['c'], BELLY['r'], 0.03)
    ell(HIPS, 0.025)
    for s in (1, -1):
        sh, el, wr = side(SHOULDER, s), side(ELBOW, s), side(WRIST, s)
        cone(sh, el, ARM_R[0], ARM_R[1], 0.013)
        cone(el, wr, ARM_R[1], ARM_R[2], 0.006)
        hand(g, s, cap)
        hp, kn, an = side(HIP, s), side(KNEE, s), side(ANKLE, s)
        cone(hp, kn, LEG_R[0], LEG_R[1], 0.014)
        cone(kn, an, LEG_R[1], LEG_R[2], 0.006)
        foot(g, s, cap)
    g.apply(tail, *bounds([TAIL[0], TAIL[1], TAIL[2]], TAIL_R[0] + 0.01), 0.02)
    g.apply(fin, (-0.01, 0.02, -0.01), (0.01, 0.215, 0.17), 0.004)
    # Sockets that fit the eyeballs exactly.
    for c, _ in eyes:
        sph(c, EYE_R + 0.0005, 0.0022, 'subtract')
    return g, eyes


def hand(g, s, cap):
    el, wr = side(ELBOW, s), side(WRIST, s)
    along = (wr - el) / np.linalg.norm(wr - el)
    palm_c = wr + along * 0.009
    rot = sdf.rot_to(along, up=(0, -1, 0))
    g.apply(lambda p: sdf.ellipsoid(p, palm_c, (0.0085, 0.012, 0.0135), rot), *bounds([palm_c], 0.014), 0.006)
    # Four little fingers fanned in the hand's plane.
    for k, ang in enumerate(np.radians([-44, -15, 15, 44])):
        dirv = np.cos(ang) * along + np.sin(ang) * rot[:, 2]
        base = palm_c + dirv * 0.007
        tip = base + dirv * (0.0125 - abs(k - 1.5) * 0.0018)
        cap(base, tip, 0.0039, 0.0028)


def foot(g, s, cap):
    c = side(FOOT['c'], s)
    g.apply(lambda p: sdf.ellipsoid(p, c, FOOT['r']), *bounds([c], max(FOOT['r'])), 0.008)
    for k, dx in enumerate(np.linspace(-0.0135, 0.0135, 4)):
        base = c + np.array([dx, -0.014, 0.0005])
        tip = base + np.array([dx * 0.45, -0.0125, -0.0015])
        cap(base, tip, 0.0046, 0.0032)


def tail_points(n=9):
    ts = np.linspace(0, 1, n)
    return ts, [sdf.bezier(*TAIL, t) for t in ts], [TAIL_R[0] + (TAIL_R[1] - TAIL_R[0]) * t ** 0.85 for t in ts]


def tail(p):
    # Chain of round cones along a bezier, flattened sideways.
    q = p.copy()
    q[..., 0] = q[..., 0] / TAIL_FLAT
    _, pts, rs = tail_points()
    d = None
    for i in range(len(pts) - 1):
        seg = sdf.round_cone(q, pts[i], pts[i + 1], rs[i], rs[i + 1])
        d = seg if d is None else sdf.smin(d, seg, 0.006)
    return d * TAIL_FLAT


def fin(p):
    """A thin crest along the back and around the tail, in the x = 0 plane."""
    ts, tail_pts, tail_rs = tail_points(12)
    # Along the back, the path sits on the skin, so the radius is the crest height.
    path = [np.array([0, 0.050, 0.150]), np.array([0, 0.057, 0.118]), np.array([0, 0.058, 0.088])]
    radii = [0.0015, 0.0045, 0.0065]
    # Around the tail, the crest stands out beyond the tail's own radius.
    for t, c, r in zip(ts, tail_pts, tail_rs):
        path.append(c)
        radii.append(r + 0.006 + 0.011 * np.sin(np.pi * min(1.0, t * 1.06)))
    radii[-1] = TAIL_R[1] + 0.006
    q = p.copy()
    q[..., 0] = 0
    d2 = None
    for i in range(len(path) - 1):
        seg = sdf.round_cone(q, path[i], path[i + 1], radii[i], radii[i + 1])
        d2 = seg if d2 is None else np.minimum(d2, seg)
    # Thin, with rounded edges.
    return sdf.smax(np.abs(p[..., 0]) - FIN_HALF_THICKNESS, d2 + 0.0008, 0.0016)


def gill_frame(g, s):
    base = side(g['base'], s)
    d = side(g['dir'], s)
    d /= np.linalg.norm(d)
    n = side(GILL_FAN_NORMAL, s)
    n /= np.linalg.norm(n)
    curl = side(g['curl'], s)
    # Fringe direction in the fan plane, perpendicular to the stalk.
    across = np.cross(n, d)
    across /= np.linalg.norm(across)
    L = g['length']
    mid = base + d * L * 0.58
    tip = base + d * L * 0.92 + curl * L * 0.55
    return base, mid, tip, across


def gill_curve(g, s, t):
    base, mid, tip, _ = gill_frame(g, s)
    return sdf.bezier(base, mid, tip, t)


GILL_LOBES = 12


def d_of(a, b):
    v = np.asarray(b, np.float64) - np.asarray(a, np.float64)
    return v / np.linalg.norm(v)


def gill_grid(g, s, voxel):
    base, mid, tip, across = gill_frame(g, s)
    lo, hi = bounds([base, mid, tip], 0.03)
    grid = sdf.Grid(lo, hi, voxel)
    ts = np.linspace(0, 1, 10)
    pts = [sdf.bezier(base, mid, tip, t) for t in ts]
    rs = [0.0062 * (1 - t) + 0.0030 * t for t in ts]
    for i in range(len(pts) - 1):
        a, b, r1, r2 = pts[i], pts[i + 1], rs[i], rs[i + 1]
        grid.apply(lambda p, a=a, b=b, r1=r1, r2=r2: sdf.round_cone(p, a, b, r1, r2),
                   *bounds([a, b], max(r1, r2)), 0.003)
    # Soft, flat filaments on both sides, fanned like a feather's barbs.
    normal = np.cross(d_of(base, tip), across)
    rng = np.random.default_rng(11 + int(g['length'] * 1000) + (s > 0))
    n = GILL_LOBES
    for j in range(n):
        t = 0.12 + 0.84 * j / (n - 1)
        for sgn in (1, -1):
            tt = min(1.0, t + (0.5 / (n - 1) if sgn > 0 else 0.0))
            c = sdf.bezier(base, mid, tip, tt)
            tan = sdf.bezier(base, mid, tip, min(tt + 0.02, 1)) - sdf.bezier(base, mid, tip, max(tt - 0.02, 0))
            tan /= np.linalg.norm(tan)
            out = across * sgn * 0.86 + tan * 0.5
            out /= np.linalg.norm(out)
            length = (0.0165 * (1 - 0.62 * tt) + 0.0032) * rng.uniform(0.88, 1.1)
            width = 0.0024 * (1 - 0.25 * tt)
            center = c + out * length * 0.5
            side_v = np.cross(out, normal)
            side_v /= np.linalg.norm(side_v)
            nrm = np.cross(side_v, out)
            rot = np.stack([side_v, out, nrm], axis=1).astype(np.float32)
            radii = (width, length * 0.5, 0.0016)
            grid.apply(lambda p, c=center, r=radii, m=rot: sdf.ellipsoid(p, c, r, m),
                       *bounds([center], length * 0.5 + 0.002), 0.0012)
    # A round cap at the tip.
    grid.apply(lambda p: sdf.sphere(p, tip, 0.0052), *bounds([tip], 0.0052), 0.002)
    return grid


# Face details.
MOUTH = dict(z=0.1625, half_width=0.031, lift=0.0048)
BLUSH = [dict(x=0.066, z=0.169, r=0.0105)]


def face_point(x, z, fn=None, offset=0.0):
    """The point on the face at (x, z), seen from the front, lifted off the skin by offset."""
    fn = fn or head_only
    x = np.asarray(x, np.float64)
    z = np.asarray(z, np.float64)
    ys = np.linspace(-0.2, 0.0, 2001)
    shape = np.broadcast(x, z).shape
    xb, zb = np.broadcast_to(x, shape).ravel(), np.broadcast_to(z, shape).ravel()
    pts = np.stack([np.repeat(xb[:, None], len(ys), 1), np.repeat(ys[None], len(xb), 0),
                    np.repeat(zb[:, None], len(ys), 1)], -1).astype(np.float32)
    vals = fn(pts.reshape(-1, 3)).reshape(len(xb), len(ys))
    first = np.argmax(vals < 0, axis=1)
    hit = pts[np.arange(len(xb)), first]
    hit = sdf.project(fn, hit, 0.0, steps=4)
    if offset:
        hit = hit + sdf.gradient(fn, hit) * offset
    return hit.reshape(*shape, 3)


# Mouth shapes: (x scale, corner lift, upper lip, lower lip) as functions of u in [-1, 1].
def mouth_shape(name):
    def closed(u):
        th = 0.00062 * (1 - 0.7 * u ** 4)
        s = MOUTH['lift'] * u ** 2
        return 1.0, s + th, s - th

    def shape(xs, lift, up, down, power=0.7):
        def f(u):
            s = lift * u ** 2
            w = np.clip(1 - u ** 2, 0, 1)
            th = 0.00062 * (1 - 0.7 * u ** 4)
            return xs, s + th + up * w ** power, s - th - down * w ** power
        return f

    shapes = {
        'Closed': closed,
        # Visemes for talking.
        'Open': shape(0.90, MOUTH['lift'] * 0.7, 0.0016, 0.0150),
        'Wide': shape(1.10, MOUTH['lift'] * 1.2, 0.0006, 0.0055),
        'Round': shape(0.42, MOUTH['lift'] * 0.1, 0.0045, 0.0085, 0.5),
        # Expressions.
        'Grin': shape(1.06, MOUTH['lift'] * 2.2, 0.0010, 0.0115, 0.9),
        'Frown': shape(0.86, -MOUTH['lift'] * 1.3, 0.0, 0.0),
        'Smile': shape(1.02, MOUTH['lift'] * 2.0, 0.0, 0.0),
        'Pout': shape(0.26, 0.0, 0.0028, 0.0034, 0.5),
    }
    return shapes[name]


MOUTH_SHAPES = ['Closed', 'Open', 'Wide', 'Round', 'Grin', 'Smile', 'Frown', 'Pout']
MOUTH_NU, MOUTH_NV = 41, 7


def mouth_points(name, offset=0.00045):
    f = mouth_shape(name)
    u = np.linspace(-1, 1, MOUTH_NU)
    xs, up, lo = f(u)
    v = np.linspace(0, 1, MOUTH_NV)
    x = (u * MOUTH['half_width'] * xs)[:, None] * np.ones_like(v)[None]
    z = MOUTH['z'] + lo[:, None] + (up - lo)[:, None] * v[None]
    return face_point(x, z, offset=offset)  # (nu, nv, 3)


# Skeleton: bone name -> (head, tail, parent). Arms, legs, eyes, lids and gills are
# added per side in bones().
def bones():
    b = {
        'root': ((0, 0, 0), (0, 0, 0.03), None),
        'hips': ((0, 0.006, 0.050), (0, 0.004, 0.088), 'root'),
        'spine': ((0, 0.004, 0.088), (0, 0.002, 0.122), 'hips'),
        'chest': ((0, 0.002, 0.122), (0, 0.000, 0.148), 'spine'),
        'head': ((0, 0.004, 0.148), (0, 0.004, 0.262), 'chest'),
    }
    for s, sx in ((1, 'L'), (-1, 'R')):
        sh, el, wr = side(SHOULDER, s), side(ELBOW, s), side(WRIST, s)
        along = (wr - el) / np.linalg.norm(wr - el)
        b[f'upper_arm.{sx}'] = (sh, el, 'chest')
        b[f'forearm.{sx}'] = (el, wr, f'upper_arm.{sx}')
        b[f'hand.{sx}'] = (wr, wr + along * 0.024, f'forearm.{sx}')
        hp, kn, an = side(HIP, s), side(KNEE, s), side(ANKLE, s)
        b[f'thigh.{sx}'] = (hp, kn, 'hips')
        b[f'shin.{sx}'] = (kn, an, f'thigh.{sx}')
        b[f'foot.{sx}'] = (an, an + np.array([0.0, -0.032, -0.006]), f'shin.{sx}')
        for i, g in enumerate(GILLS):
            p0, p1, p2 = (gill_curve(g, s, t) for t in (0.0, 0.45, 1.0))
            b[f'gill.{i}.{sx}.0'] = (p0, p1, 'head')
            b[f'gill.{i}.{sx}.1'] = (p1, p2, f'gill.{i}.{sx}.0')
    ts, pts, _ = tail_points(6)
    parent = 'hips'
    for i in range(5):
        b[f'tail.{i}'] = (pts[i], pts[i + 1], parent)
        parent = f'tail.{i}'
    return b


TAIL_BONES = 5


def torso_only(p):
    d = sdf.ellipsoid(p, TORSO['c'], TORSO['r'])
    d = sdf.smin(d, sdf.sphere(p, BELLY['c'], BELLY['r']), 0.03)
    return sdf.smin(d, sdf.ellipsoid(p, HIPS['c'], HIPS['r']), 0.025)


def arm_only(p, s):
    sh, el, wr = side(SHOULDER, s), side(ELBOW, s), side(WRIST, s)
    along = (wr - el) / np.linalg.norm(wr - el)
    d = limb(p, sh, el, wr, ARM_R)
    return np.minimum(d, sdf.sphere(p, wr + along * 0.012, 0.016))


def leg_only(p, s):
    d = limb(p, side(HIP, s), side(KNEE, s), side(ANKLE, s), LEG_R)
    return np.minimum(d, sdf.ellipsoid(p, side(FOOT['c'], s), FOOT['r']) - 0.006)


def limb(p, a, b, c, r):
    d = sdf.round_cone(p, a, b, r[0], r[1])
    return sdf.smin(d, sdf.round_cone(p, b, c, r[1], r[2]), 0.006)


def chain_param(p, pts):
    """Arc-length parameter (0..1) of each point's projection onto a polyline."""
    pts = np.asarray(pts, np.float64)
    seg = pts[1:] - pts[:-1]
    lens = np.linalg.norm(seg, axis=1)
    cum = np.concatenate([[0], np.cumsum(lens)])
    best_d = np.full(len(p), np.inf)
    best_s = np.zeros(len(p))
    for i in range(len(seg)):
        t = np.clip(((p - pts[i]) @ seg[i]) / (lens[i] ** 2), 0, 1)
        q = pts[i] + t[:, None] * seg[i]
        d = np.linalg.norm(p - q, axis=1)
        better = d < best_d
        best_d = np.where(better, d, best_d)
        best_s = np.where(better, (cum[i] + t * lens[i]) / cum[-1], best_s)
    return best_s


def chain_weights(s, centers):
    """Linear blend weights between consecutive bone centers along a chain parameter."""
    centers = np.asarray(centers)
    w = np.zeros((len(s), len(centers)))
    s = np.clip(s, centers[0], centers[-1])
    for i in range(len(centers) - 1):
        a, b = centers[i], centers[i + 1]
        inside = (s >= a) & (s <= b)
        t = np.where(inside, (s - a) / (b - a), 0)
        t = t * t * (3 - 2 * t)
        w[inside, i] += 1 - t[inside]
        w[inside, i + 1] += t[inside]
    return w


def body_weights(co):
    """Bone weights for the body mesh: soft part membership from the shapes, then
    blends along each part's bones."""
    p = co.astype(np.float32)
    parts = {
        'head': head_only(p),
        'torso': torso_only(p),
        'tail': tail(p),
    }
    for s, sx in ((1, 'L'), (-1, 'R')):
        parts[f'arm.{sx}'] = arm_only(p, s)
        parts[f'leg.{sx}'] = leg_only(p, s)
    names = list(parts)
    D = np.stack([parts[n] for n in names], 1).astype(np.float64)
    tau = {'head': 0.0075, 'torso': 0.005, 'tail': 0.006}
    T = np.array([tau.get(n, 0.0035) for n in names])
    logits = -(D - D.min(1, keepdims=True)) / T
    M = np.exp(logits)
    M /= M.sum(1, keepdims=True)
    member = dict(zip(names, M.T))
    W = {}

    def add(bone, w):
        W[bone] = W.get(bone, 0) + w

    add('head', member['head'])
    zc = chain_weights(co[:, 2], [0.062, 0.100, 0.138])
    for i, bone in enumerate(('hips', 'spine', 'chest')):
        add(bone, member['torso'] * zc[:, i])
    for s, sx in ((1, 'L'), (-1, 'R')):
        sh, el, wr = side(SHOULDER, s), side(ELBOW, s), side(WRIST, s)
        along = (wr - el) / np.linalg.norm(wr - el)
        tipp = wr + along * 0.03
        chain = [sh, el, wr, tipp]
        sp = chain_param(co, chain)
        L = np.cumsum([0] + [np.linalg.norm(chain[i + 1] - chain[i]) for i in range(3)])
        L /= L[-1]
        cw = chain_weights(sp, [L[0] + 0.02, (L[0] + L[1]) / 2 + 0.05, (L[1] + L[2]) / 2 + 0.04, L[2] + 0.06])
        # shoulder, upper arm, forearm, hand
        add('chest', member[f'arm.{sx}'] * cw[:, 0] * 0.35)
        add(f'upper_arm.{sx}', member[f'arm.{sx}'] * (cw[:, 0] * 0.65 + cw[:, 1]))
        add(f'forearm.{sx}', member[f'arm.{sx}'] * cw[:, 2])
        add(f'hand.{sx}', member[f'arm.{sx}'] * cw[:, 3])
        hp, kn, an = side(HIP, s), side(KNEE, s), side(ANKLE, s)
        toe = an + np.array([0.0, -0.034, -0.006])
        chain = [hp, kn, an, toe]
        sp = chain_param(co, chain)
        L = np.cumsum([0] + [np.linalg.norm(chain[i + 1] - chain[i]) for i in range(3)])
        L /= L[-1]
        cw = chain_weights(sp, [L[0], (L[0] + L[1]) / 2, (L[1] + L[2]) / 2 + 0.03, L[2] + 0.1])
        add('hips', member[f'leg.{sx}'] * cw[:, 0] * 0.5)
        add(f'thigh.{sx}', member[f'leg.{sx}'] * (cw[:, 0] * 0.5 + cw[:, 1]))
        add(f'shin.{sx}', member[f'leg.{sx}'] * cw[:, 2])
        add(f'foot.{sx}', member[f'leg.{sx}'] * cw[:, 3])
    _, pts, _ = tail_points(6)
    sp = chain_param(co, pts)
    centers = [0.0] + [(i + 0.5) / TAIL_BONES for i in range(TAIL_BONES)]
    cw = chain_weights(sp, centers)
    add('hips', member['tail'] * cw[:, 0])
    for i in range(TAIL_BONES):
        add(f'tail.{i}', member['tail'] * cw[:, i + 1])
    return W
