# Signed distance functions in numpy, for modeling Gilly as smooth blended shapes.
# Distances are in meters. Points are arrays of shape (..., 3).
# Formulas follow Inigo Quilez's articles on distance functions.

import numpy as np


def length(v):
    return np.sqrt(np.einsum('...i,...i->...', v, v))


def dot(a, b):
    return np.einsum('...i,...i->...', a, b)


def sphere(p, c, r):
    return length(p - np.asarray(c, np.float32)) - r


def ellipsoid(p, c, r, rot=None):
    """Approximate ellipsoid. rot: 3x3 matrix whose columns are the local axes."""
    q = p - np.asarray(c, np.float32)
    if rot is not None:
        q = q @ np.asarray(rot, np.float32)
    r = np.asarray(r, np.float32)
    k0 = length(q / r)
    k1 = length(q / (r * r))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def round_cone(p, a, b, r1, r2):
    """Capsule from a (radius r1) to b (radius r2)."""
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    ba = b - a
    l2 = float(ba @ ba)
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = p - a
    y = pa @ ba
    z = y - l2
    w = pa * l2 - y[..., None] * ba
    x2 = dot(w, w)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d_mid = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d_b = np.sqrt(x2 + z2) * il2 - r2
    d_a = np.sqrt(x2 + y2) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d_b, np.where(np.sign(y) * a2 * y2 < k, d_a, d_mid))


def capsule(p, a, b, r):
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    pa = p - a
    ba = b - a
    h = np.clip((pa @ ba) / float(ba @ ba), 0.0, 1.0)
    return length(pa - h[..., None] * ba) - r


def smin(a, b, k):
    """Smooth union with blend radius k."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    """Smooth intersection; smax(a, -b, k) subtracts b from a."""
    return -smin(-a, -b, k)


def rot_to(forward, up=(0, 0, 1)):
    """Rotation matrix whose columns are (side, forward, up') for an ellipsoid aligned to forward."""
    f = np.asarray(forward, np.float64)
    f = f / np.linalg.norm(f)
    u = np.asarray(up, np.float64)
    s = np.cross(f, u)
    if np.linalg.norm(s) < 1e-6:
        s = np.cross(f, (1, 0, 0))
    s /= np.linalg.norm(s)
    u = np.cross(s, f)
    return np.stack([s, f, u], axis=1).astype(np.float32)


def bezier(p0, p1, p2, t):
    p0, p1, p2 = (np.asarray(v, np.float64) for v in (p0, p1, p2))
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2


class Grid:
    """A sampled distance field that shapes are blended into one region at a time.

    Evaluating each shape only inside its own bounds (grown by the blend radius)
    keeps small details like fingers and gill fringes cheap."""

    def __init__(self, lo, hi, voxel):
        self.lo = np.asarray(lo, np.float64)
        self.voxel = voxel
        self.n = np.ceil((np.asarray(hi, np.float64) - self.lo) / voxel).astype(int) + 1
        self.values = np.full(self.n, 1.0, np.float32)

    def region(self, lo, hi):
        i0 = np.clip(np.floor((np.asarray(lo) - self.lo) / self.voxel).astype(int), 0, self.n)
        i1 = np.clip(np.ceil((np.asarray(hi) - self.lo) / self.voxel).astype(int) + 1, 0, self.n)
        if np.any(i1 <= i0):
            return None, None
        axes = [(self.lo[a] + np.arange(i0[a], i1[a]) * self.voxel).astype(np.float32) for a in range(3)]
        X, Y, Z = np.meshgrid(*axes, indexing='ij')
        sl = tuple(slice(i0[a], i1[a]) for a in range(3))
        return sl, np.stack([X, Y, Z], axis=-1)

    def apply(self, fn, lo, hi, k=0.0, op='union'):
        margin = k + 3 * self.voxel
        sl, p = self.region(np.asarray(lo) - margin, np.asarray(hi) + margin)
        if sl is None:
            return
        d = fn(p)
        if op == 'union':
            self.values[sl] = smin(self.values[sl], d, k)
        elif op == 'subtract':
            self.values[sl] = smax(self.values[sl], -d, k)
        else:
            raise ValueError(op)

    def mesh(self, adaptivity=0.0):
        return mesh_from_grid(self.values, self.lo, self.voxel, adaptivity)


def evaluate(fn, lo, hi, voxel, chunk=24):
    """Samples fn on a grid covering [lo, hi]. Returns (values[i,j,k], origin)."""
    lo = np.asarray(lo, np.float64)
    hi = np.asarray(hi, np.float64)
    n = np.ceil((hi - lo) / voxel).astype(int) + 1
    xs = (lo[0] + np.arange(n[0]) * voxel).astype(np.float32)
    ys = (lo[1] + np.arange(n[1]) * voxel).astype(np.float32)
    zs = (lo[2] + np.arange(n[2]) * voxel).astype(np.float32)
    out = np.empty(n, np.float32)
    for i0 in range(0, n[0], chunk):
        X, Y, Z = np.meshgrid(xs[i0:i0 + chunk], ys, zs, indexing='ij')
        p = np.stack([X, Y, Z], axis=-1)
        out[i0:i0 + chunk] = fn(p)
    return out, lo


def mesh_from_grid(values, origin, voxel, adaptivity=0.0):
    """Zero isosurface of a sampled SDF as (points, quads, triangles) via OpenVDB."""
    import openvdb as vdb
    grid = vdb.FloatGrid()
    grid.copyFromArray(values)
    points, tris, quads = grid.convertToPolygons(isovalue=0.0, adaptivity=adaptivity)
    points = points * voxel + origin
    return points.astype(np.float64), quads, tris


def gradient(fn, p, eps=2e-4):
    e = np.eye(3, dtype=np.float32) * eps
    g = np.stack([fn(p + e[i]) - fn(p - e[i]) for i in range(3)], axis=-1)
    return g / np.maximum(length(g)[..., None], 1e-12)


def project(fn, p, offset=0.0, steps=6):
    """Moves points onto the surface fn(p) = offset."""
    p = np.asarray(p, np.float32).copy()
    for _ in range(steps):
        d = fn(p) - offset
        p -= d[..., None] * gradient(fn, p)
    return p
