# Builds Gilly, the Tidelight Aquarium axolotl, from signed distance fields.
#
#   Blender --background --factory-startup --python gilly.py -- --out DIR [--preview] [--voxel 0.0012]
#
# Needs Blender 5.2 (it bundles numpy and OpenVDB). Everything is generated:
# no hand-made assets.

import math
import os
import sys
import time

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True  # No __pycache__ next to the sources.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anatomy as A  # noqa: E402
import sdf  # noqa: E402


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = {'out': os.getcwd(), 'voxel': 0.0012, 'preview': False}
    i = 0
    while i < len(argv):
        key = argv[i].lstrip('-')
        if key in ('preview', 'export', 'posetest'):
            args[key] = True
        else:
            args[key] = argv[i + 1]
            i += 1
        i += 1
    args['voxel'] = float(args['voxel'])
    return args


ARGS = parse_args()
T0 = time.time()


def log(*a):
    print(f'[gilly {time.time() - T0:6.1f}s]', *a, flush=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_object(name, points, quads, tris=None):
    faces = [tuple(q) for q in quads.tolist()]
    if tris is not None and len(tris):
        faces += [tuple(t) for t in tris.tolist()]
    me = bpy.data.meshes.new(name)
    me.from_pydata(points.tolist(), [], faces)
    me.validate()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    return obj


def apply_modifier(obj, mod):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = obj.data
    obj.modifiers.remove(mod)
    obj.data = me
    bpy.data.meshes.remove(old)


def decimate(obj, target_tris):
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris <= target_tris:
        return
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = target_tris / tris
    mod.use_collapse_triangulate = True
    apply_modifier(obj, mod)


def smooth(obj, factor=0.5, repeat=2):
    mod = obj.modifiers.new('smooth', 'SMOOTH')
    mod.factor = factor
    mod.iterations = repeat
    apply_modifier(obj, mod)


def build_body(voxel):
    log('body: sampling SDF')
    grid, eyes = A.body_grid(voxel)
    points, quads, tris = grid.mesh()
    log('body: mesh', len(points), 'points', len(quads), 'quads')
    obj = mesh_object('Body', points, quads, tris)
    smooth(obj, 0.5, 1)
    decimate(obj, 26000)
    log('body: decimated to', len(obj.data.polygons), 'faces')
    return obj, eyes


def build_gills(voxel):
    objs = []
    for i, g in enumerate(A.GILLS):
        for side, suffix in ((1, 'L'), (-1, 'R')):
            points, quads, tris = A.gill_grid(g, side, voxel).mesh()
            obj = mesh_object(f'Gill.{i}.{suffix}', points, quads, tris)
            smooth(obj, 0.5, 1)
            decimate(obj, 3000)
            objs.append(obj)
    log('gills: built', len(objs))
    return objs


def build_eyes(eyes):
    objs = []
    for (c, d), suffix in zip(eyes, ('L', 'R')):
        bm = bmesh.new()
        bm.loops.layers.uv.new('UVMap')  # calc_uvs only fills an existing layer.
        bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=A.EYE_R, calc_uvs=True)
        me = bpy.data.meshes.new(f'Eye.{suffix}')
        bm.to_mesh(me)
        bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        obj = bpy.data.objects.new(f'Eye.{suffix}', me)
        bpy.context.scene.collection.objects.link(obj)
        # Sphere poles along the look direction so the iris sits around the +Z pole.
        rot = Vector((0, 0, 1)).rotation_difference(Vector(d))
        obj.matrix_world = Matrix.Translation(Vector(c)) @ rot.to_matrix().to_4x4()
        objs.append(obj)
    return objs


def eye_frame(d):
    """Eye-local axes: side (x), up (y) and forward (z, the look direction)."""
    f = np.asarray(d, np.float64) / np.linalg.norm(d)
    x = np.cross((0, 0, 1), f)
    x /= np.linalg.norm(x)
    u = np.cross(f, x)  # Right-handed: x × u = f.
    return x, u, f


def build_lids(eyes):
    """Spherical shells over each eyeball, built open. Rotating a lid bone around the
    eye's side axis by LID_OPEN degrees (negated) closes it."""
    objs = []
    radius = A.EYE_R + A.LID_GAP
    nt, npsi = 20, 40
    for (c, d), suffix in zip(eyes, ('L', 'R')):
        x, u, f = eye_frame(d)
        for which in ('upper', 'lower'):
            sgn = 1 if which == 'upper' else -1
            beta = np.radians(A.LID_OPEN[which])
            verts, cols_t = [], []
            thetas = np.radians(np.linspace(0, 93, nt))
            psis = np.linspace(0, 2 * np.pi, npsi, endpoint=False)
            for th in thetas[1:]:
                for ps in psis:
                    lx, ly, lz = np.sin(th) * np.cos(ps), sgn * np.cos(th), np.sin(th) * np.sin(ps)
                    # Open the lid: rotate about the side axis.
                    ly, lz = ly * np.cos(beta) - lz * np.sin(beta), ly * np.sin(beta) + lz * np.cos(beta)
                    verts.append(c + radius * (x * lx + u * ly + f * lz))
                    cols_t.append(np.degrees(th))
            pole_y, pole_z = sgn * np.cos(beta), sgn * np.sin(beta)
            verts.append(c + radius * (u * pole_y + f * pole_z))
            cols_t.append(0.0)
            pole = len(verts) - 1
            faces = []
            for i in range(nt - 2):
                for j in range(npsi):
                    a = i * npsi + j
                    b = i * npsi + (j + 1) % npsi
                    faces.append((a, b, b + npsi, a + npsi))
            for j in range(npsi):
                faces.append((pole, (j + 1) % npsi, j))
            me = bpy.data.meshes.new(f'Lid.{which}.{suffix}')
            me.from_pydata(np.array(verts).tolist(), [], faces)
            obj = bpy.data.objects.new(me.name, me)
            bpy.context.scene.collection.objects.link(obj)
            for poly in me.polygons:
                poly.use_smooth = True
            # Normals must face away from the eyeball.
            bm = bmesh.new()
            bm.from_mesh(me)
            bm.normal_update()
            center = Vector(c)
            flip = sum((fa.calc_center_median() - center).dot(fa.normal) for fa in bm.faces) < 0
            if flip:
                bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.to_mesh(me)
            bm.free()
            # Skin color like the head around the eye, with a soft darker edge.
            co, nr = vertex_arrays(obj)
            col = skin_color(co, nr)
            edge = smoothstep(80, 93, np.array(cols_t))[:, None]
            col = col * (1 - 0.45 * edge) + np.array(srgb('#b8486c'))[None] * 0.45 * edge
            set_colors(obj, col)
            objs.append(obj)
    return objs


def eye_texture(size=512):
    """Iris, pupil and sclera by angle from the front pole (+Z, where v = 1)."""
    h, w = size // 2, size
    v = (np.arange(h) + 0.5) / h
    u = (np.arange(w) + 0.5) / w
    theta = (1 - v)[:, None] * np.pi * np.ones((1, w))  # angle from the front pole
    ang = u[None, :] * 2 * np.pi * np.ones((h, 1))
    deg = np.degrees(theta)
    rng = np.random.default_rng(3)
    streak = 1 + 0.10 * np.sin(ang * 37 + rng.uniform(0, 6)) * np.sin(ang * 11 + 1.3) + 0.06 * np.sin(ang * 83)
    sclera = np.array(srgb('#f6f1ef'))
    iris_in = np.array(srgb('#4a2536'))
    iris_out = np.array(srgb('#23121b'))
    limbal = np.array(srgb('#0c0609'))
    pupil = np.array(srgb('#040203'))
    PUPIL, IRIS = 29.0, 63.0
    t = np.clip((deg - PUPIL) / (IRIS - PUPIL), 0, 1)[..., None]
    iris = iris_in * (1 - t) + iris_out * t
    iris = iris * streak[..., None]
    ring = np.clip((deg - (IRIS - 6)) / 6, 0, 1)[..., None]
    iris = iris * (1 - ring) + limbal * ring
    col = np.where((deg < IRIS)[..., None], iris, sclera)
    # Soft edges between regions.
    pw = np.clip((deg - PUPIL + 1.2) / 2.4, 0, 1)[..., None]
    col = np.where((deg < PUPIL + 1.2)[..., None], pupil * (1 - pw) + col * pw, col)
    sw = np.clip((deg - IRIS) / 2.0, 0, 1)[..., None]
    col = np.where(((deg >= IRIS) & (deg < IRIS + 2))[..., None], limbal * (1 - sw) + sclera * sw, col)
    # The sclera darkens toward the back of the eyeball.
    back = np.clip((deg - 70) / 50, 0, 1)[..., None]
    col = col * (1 - 0.35 * back)
    img = bpy.data.images.new('EyeTexture', w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'
    rgba = np.concatenate([linear_to_srgb(col), np.ones((h, w, 1))], -1).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(ARGS['out'], 'eye.png')
    img.file_format = 'PNG'
    img.save()
    return img


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def build_mouth():
    nu, nv = A.MOUTH_NU, A.MOUTH_NV
    base = A.mouth_points('Closed')
    verts = base.reshape(-1, 3)
    faces = []
    for i in range(nu - 1):
        for j in range(nv - 1):
            a = i * nv + j
            faces.append((a, a + nv, a + nv + 1, a + 1))
    me = bpy.data.meshes.new('Mouth')
    me.from_pydata(verts.tolist(), [], faces)
    obj = bpy.data.objects.new('Mouth', me)
    bpy.context.scene.collection.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = True
    # Faces must point out of the face (-Y).
    if np.mean([p.normal.y for p in me.polygons]) > 0:
        for poly in me.polygons:
            poly.flip()
    obj.shape_key_add(name='Basis', from_mix=False)
    for name in A.MOUTH_SHAPES[1:]:
        key = obj.shape_key_add(name=name, from_mix=False)
        key.data.foreach_set('co', A.mouth_points(name).reshape(-1).astype(np.float32))
        key.value = 0.0  # New keys can start at 1.
    # Colors: a dark mouth with a tongue resting in the lower half.
    u = np.repeat(np.linspace(-1, 1, nu), nv)
    v = np.tile(np.linspace(0, 1, nv), nu)
    inside = np.array(srgb('#5e1830'))
    top = np.array(srgb('#3d0d1f'))
    tongue = np.array(srgb('#e0708c'))
    col = inside[None] * (1 - v[:, None]) + top[None] * v[:, None]
    tw = np.clip(1 - ((u / 0.62) ** 2 + ((v - 0.05) / 0.5) ** 2), 0, 1) ** 0.5
    col = col * (1 - tw[:, None]) + tongue[None] * tw[:, None]
    set_colors(obj, col)
    return obj


def set_colors(obj, col):
    me = obj.data
    attr = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    rgba = np.concatenate([col, np.ones((len(col), 1))], 1).astype(np.float32)
    attr.data.foreach_set('color', rgba.ravel())
    me.color_attributes.active_color = attr


def vertex_arrays(obj):
    me = obj.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get('co', co)
    nr = np.empty(n * 3, np.float32)
    me.vertices.foreach_get('normal', nr)
    return co.reshape(n, 3).astype(np.float64), nr.reshape(n, 3).astype(np.float64)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def skin_color(co, nr):
    top = np.array(srgb('#e97f9e'))
    belly = np.array(srgb('#f8c6d2'))
    # Countershading: lighter where the skin faces forward and down.
    under = np.array([0, -0.55, -0.83])
    t = smoothstep(-0.45, 0.75, nr @ (under / np.linalg.norm(under)))
    return top[None] * (1 - t[:, None]) + belly[None] * t[:, None]


def paint_body(obj):
    co, nr = vertex_arrays(obj)
    blush = np.array(srgb('#f27594'))
    fin = np.array(srgb('#f8c7d3'))
    toes = np.array(srgb('#fbd9e0'))
    col = skin_color(co, nr)
    # Pale, see-through-looking fin edges.
    fw = smoothstep(0.0045, 0.0015, np.abs(co[:, 0])) * smoothstep(0.03, 0.06, co[:, 1])
    col = col * (1 - fw[:, None]) + fin[None] * fw[:, None]
    # Lighter fingertips and toes.
    for s in (1, -1):
        hand_c = A.side(A.WRIST, s) + (A.side(A.WRIST, s) - A.side(A.ELBOW, s)) * 0.9
        tw = smoothstep(0.022, 0.012, np.linalg.norm(co - hand_c, axis=1))
        col = col * (1 - 0.6 * tw[:, None]) + toes[None] * 0.6 * tw[:, None]
    # Rosy cheeks.
    for b in A.BLUSH:
        for s in (1, -1):
            c = A.face_point(np.array([b['x'] * s]), np.array([b['z']]))[0]
            d = np.linalg.norm(co - c, axis=1)
            w = 0.8 * np.exp(-(d / b['r']) ** 2)
            col = col * (1 - w[:, None]) + blush[None] * w[:, None]
    set_colors(obj, col)


def paint_gill(obj, g, s):
    co, _ = vertex_arrays(obj)
    base_c = np.array(srgb('#d93a66'))
    tip_c = np.array(srgb('#f5809f'))
    b = A.side(g['base'], s)
    t = smoothstep(0.01, g['length'] * 1.05, np.linalg.norm(co - b, axis=1))
    col = base_c[None] * (1 - t[:, None]) + tip_c[None] * t[:, None]
    set_colors(obj, col)


def material(name, roughness=0.5, coat=0.0, sss=0.0, image=None, color=None):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    elif color is not None:
        bsdf.inputs['Base Color'].default_value = (*color, 1)
    else:
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Color'
        nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Subsurface Weight'].default_value = sss
    bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.3)
    bsdf.inputs['Subsurface Scale'].default_value = 0.01
    return mat


def srgb(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def preview_setup():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (*srgb('#dfe9ee'), 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.world = world

    def light(name, kind, loc, energy, size, color='#ffffff'):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = srgb(color)
        if kind == 'AREA':
            data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        direction = Vector((0, 0, 0.15)) - Vector(loc)
        obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(obj)

    light('Key', 'AREA', (-0.5, -0.7, 0.8), 60, 0.5, '#fff4ea')
    light('Fill', 'AREA', (0.8, -0.5, 0.3), 18, 0.8, '#e8f2ff')
    light('Rim', 'AREA', (0.2, 0.9, 0.6), 45, 0.4, '#ffffff')


def render(name, loc, target=(0, 0, 0.145), ortho=None, lens=85):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new(name)
    if ortho:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = ortho
    else:
        cam_data.lens = lens
    cam = bpy.data.objects.new(name, cam_data)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    path = os.path.join(ARGS['out'], f'{name}.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    log('rendered', path)


def build_armature(eyes):
    arm_data = bpy.data.armatures.new('GillyRig')
    rig = bpy.data.objects.new('Gilly', arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    spec = A.bones()
    for (c, d), sx in zip(eyes, ('L', 'R')):
        x, u, f = eye_frame(d)
        spec[f'eye.{sx}'] = (c, c + f * 0.02, 'head')
        spec[f'lid_up.{sx}'] = (c, c + f * 0.016, 'head')
        spec[f'lid_lo.{sx}'] = (c, c + f * 0.014, 'head')
    ebones = {}
    for name, (h, t, parent) in spec.items():
        eb = arm_data.edit_bones.new(name)
        eb.head = Vector(h)
        eb.tail = Vector(t)
        eb.use_connect = False
        ebones[name] = eb
    for name, (h, t, parent) in spec.items():
        if parent:
            ebones[name].parent = ebones[parent]
    # Eye and lid bones: local Z points up, local X along the eye's side axis.
    for (c, d), sx in zip(eyes, ('L', 'R')):
        x, u, f = eye_frame(d)
        for n in (f'eye.{sx}', f'lid_up.{sx}', f'lid_lo.{sx}'):
            ebones[n].align_roll(Vector(u))
    for name, eb in ebones.items():
        if eb.head.z < eb.tail.z - 1e-6 and name in ('hips', 'spine', 'chest', 'head', 'root'):
            eb.align_roll(Vector((0, -1, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.data.display_type = 'STICK'
    return rig


def skin(obj, rig, weights):
    """weights: {bone: per-vertex array}. Keeps the 4 largest influences per vertex."""
    names = list(weights)
    W = np.stack([np.broadcast_to(weights[n], (len(obj.data.vertices),)) for n in names], 1).astype(np.float64)
    order = np.argsort(-W, axis=1)[:, :4]
    top = np.take_along_axis(W, order, 1)
    top[top < 0.01] = 0
    top /= np.maximum(top.sum(1, keepdims=True), 1e-9)
    groups = {n: obj.vertex_groups.new(name=n) for n in names}
    for vi in range(len(obj.data.vertices)):
        for k in range(order.shape[1]):
            if top[vi, k] > 0:
                groups[names[order[vi, k]]].add([vi], float(top[vi, k]), 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    obj.parent = rig


def rig_everything(rig, body, gills, eye_objs, lids, mouth, eyes):
    co, _ = vertex_arrays(body)
    skin(body, rig, A.body_weights(co))
    for i, g in enumerate(A.GILLS):
        for j, (s, sx) in enumerate(((1, 'L'), (-1, 'R'))):
            obj = gills[2 * i + j]
            co, _ = vertex_arrays(obj)
            base = A.side(g['base'], s)
            t = np.linalg.norm(co - base, axis=1) / g['length']
            w1 = smoothstep(0.32, 0.62, t)
            skin(obj, rig, {f'gill.{i}.{sx}.0': 1 - w1, f'gill.{i}.{sx}.1': w1, 'head': np.zeros(len(co))})
    for obj, sx in zip(eye_objs, ('L', 'R')):
        skin(obj, rig, {f'eye.{sx}': np.ones(len(obj.data.vertices))})
    for obj in lids:
        _, which, sx = obj.name.split('.')
        bone = f"lid_{'up' if which == 'upper' else 'lo'}.{sx}"
        skin(obj, rig, {bone: np.ones(len(obj.data.vertices))})
    skin(mouth, rig, {'head': np.ones(len(mouth.data.vertices))})


def bake_ao(objs, samples=96):
    """Bakes ambient occlusion into an 'AO' color attribute on each mesh, then darkens
    the base colors with a warm tint: creases read as soft and fleshy, not grey."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.device = 'CPU'
    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    for obj in objs:
        me = obj.data
        base = me.color_attributes['Color']
        ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    scene.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    warm = np.array(srgb('#9c2f55'))
    for obj in objs:
        me = obj.data
        n = len(me.vertices)
        ao = np.empty(n * 4, np.float32)
        me.color_attributes['AO'].data.foreach_get('color', ao)
        ao = ao.reshape(n, 4)[:, 0].astype(np.float64)
        col = np.empty(n * 4, np.float32)
        me.color_attributes['Color'].data.foreach_get('color', col)
        col = col.reshape(n, 4)[:, :3].astype(np.float64)
        occ = np.clip(1 - ao, 0, 1) ** 1.2 * 0.85
        tint = col * warm[None] * 1.8
        col = col * (1 - occ[:, None]) + tint * occ[:, None] * 0.55
        rgba = np.concatenate([col, np.ones((n, 1))], 1).astype(np.float32)
        me.color_attributes['Color'].data.foreach_set('color', rgba.ravel())
        me.color_attributes.remove(me.color_attributes['AO'])
        me.color_attributes.active_color = me.color_attributes['Color']
    log('baked AO into', len(objs), 'meshes')


def rig_metadata(rig, eyes):
    """Facts the web runtime needs, stored as glTF extras on the armature."""
    import json
    spec = A.bones()
    tails = {}
    for name, (h, t, parent) in spec.items():
        tails[name.replace('.', '')] = [float(v) for v in to_gltf(t)]
    meta = {
        'boneTails': tails,
        'eyes': [],
        'lidOpen': A.LID_OPEN,
        'eyeRadius': A.EYE_R,
        'mouthShapes': A.MOUTH_SHAPES[1:],
        'height': 0.29,
        'mouthCenter': to_gltf(A.mouth_points('Closed')[A.MOUTH_NU // 2, A.MOUTH_NV // 2]),
    }
    for (c, d), sx in zip(eyes, ('L', 'R')):
        x, u, f = eye_frame(d)
        meta['eyes'].append({'side': sx, 'center': to_gltf(c), 'forward': to_gltf(f), 'up': to_gltf(u), 'x': to_gltf(x)})
    rig['gilly'] = json.dumps(meta)


def to_gltf(v):
    """Blender (x, y, z) to glTF (x, z, -y)."""
    v = np.asarray(v, np.float64)
    return [round(float(v[0]), 6), round(float(v[2]), 6), round(float(-v[1]), 6)]


def export_glb(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
        export_skins=True, export_all_influences=False, export_morph=True, export_morph_normal=True,
        export_animations=False, export_def_bones=False, export_leaf_bone=False,
        export_vertex_color='ACTIVE', export_materials='EXPORT', export_image_format='AUTO',
        export_rest_position_armature=True, export_extras=True)
    log('exported', path, os.path.getsize(path) // 1024, 'KB')


def pose(rig, name, axis, degrees):
    """Rotates a pose bone about an armature-space axis, relative to its rest pose."""
    from mathutils import Quaternion
    pb = rig.pose.bones[name]
    rest = pb.bone.matrix_local.to_quaternion()
    q = Quaternion(Vector(axis).normalized(), math.radians(degrees))
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = (rest.inverted() @ q @ rest) @ pb.rotation_quaternion


def pose_test(rig, eyes):
    pose(rig, 'head', (0, 0, 1), 22)
    pose(rig, 'head', (0, 1, 0), -10)
    pose(rig, 'spine', (1, 0, 0), 8)
    pose(rig, 'upper_arm.L', (0, 1, 0), 95)
    pose(rig, 'forearm.L', (0, 1, 0), 40)
    pose(rig, 'upper_arm.R', (1, 0, 0), -40)
    pose(rig, 'forearm.R', (1, 0, 0), -45)
    pose(rig, 'thigh.R', (1, 0, 0), -35)
    pose(rig, 'shin.R', (1, 0, 0), 35)
    for i in range(A.TAIL_BONES):
        pose(rig, f'tail.{i}', (0, 0, 1), 12)
    for i in range(3):
        pose(rig, f'gill.{i}.L.0', (0, 1, 0), -25)
        pose(rig, f'gill.{i}.L.1', (0, 1, 0), -25)
    x, u, f = eye_frame(eyes[0][1])
    # Closing a lid undoes its opening rotation about the eye's side axis.
    pose(rig, 'lid_up.L', x, -A.LID_OPEN['upper'])
    pose(rig, 'lid_lo.L', x, -A.LID_OPEN['lower'])
    x, u, f = eye_frame(eyes[1][1])
    pose(rig, 'lid_up.R', x, -A.LID_OPEN['upper'] * 0.45)
    pose(rig, 'lid_lo.R', x, -A.LID_OPEN['lower'] * 0.45)
    pose(rig, 'eye.R', (0, 0, 1), -20)


# --- The AR version (USDZ) ---------------------------------------------------------------

def join_meshes(objs, name):
    """One mesh for AR: fewer draw calls and one texture. The mouth goes first so its
    shape keys survive the join."""
    active = next((o for o in objs if o.data.shape_keys), objs[0])
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active
    with bpy.context.temp_override(active_object=active, object=active, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    active.name = name
    active.data.name = name
    return active


def bake_color_texture(obj, size, path):
    """Vertex colors (with the AO already in them) → one UV-mapped texture."""
    scene = bpy.context.scene
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name='UVMap')
    with bpy.context.temp_override(active_object=obj, object=obj, edit_object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('GillyColor', size, size, alpha=False)
    img.colorspace_settings.name = 'sRGB'
    originals = []
    for slot in obj.material_slots:
        mat = slot.material
        nt = mat.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        originals.append((mat, out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None))
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Color'
        emit = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(attr.outputs['Color'], emit.inputs['Color'])
        nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        nt.nodes.active = tex
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.render.bake.margin = 8
    scene.render.bake.target = 'IMAGE_TEXTURES'
    with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
        bpy.ops.object.bake(type='EMIT')
    img.filepath_raw = path
    img.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.quality = 88
    img.save()
    # One PBR material for the whole skin, textured.
    mat = bpy.data.materials.new('GillySkin')
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.45
    bsdf.inputs['Coat Weight'].default_value = 0.25
    bsdf.inputs['Coat Roughness'].default_value = 0.35
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    log('baked color texture', path)
    return img


def sanitize(name):
    """three.js's node names: GLTFLoader drops characters like '.'."""
    return name.replace('.', '').replace(' ', '_')


def import_showreel(rig, mesh, data):
    """Keyframes every recorded frame onto the rig, the armature object (root motion,
    squash and stretch) and the mouth's shape keys."""
    from bpy_extras import anim_utils  # noqa: F401  (ensures the slotted-action helpers load)
    from mathutils import Quaternion
    C = Matrix.Rotation(math.radians(90), 4, 'X')  # glTF (Y up) → Blender (Z up)
    Ci = C.inverted()

    def trs(a):
        return Matrix.LocRotScale(Vector(a[0:3]), Quaternion((a[6], a[3], a[4], a[5])), Vector(a[7:10]))

    def conv(a):
        return C @ trs(a) @ Ci

    names = {sanitize(pb.name): pb.name for pb in rig.pose.bones}
    order = [names[n] for n in data['bones']]
    index = {n: i for i, n in enumerate(order)}
    rest_b = {n: rig.data.bones[n].matrix_local.copy() for n in order}
    # The glTF bone frames may differ from Blender's by a constant: calibrate at rest.
    fix = {n: conv(data['rest'][i]).inverted() @ rest_b[n] for i, n in enumerate(order)}
    frames = data['frames']
    n = len(frames)
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    rig.rotation_mode = 'QUATERNION'
    # Parents before children.
    depth = {n: len(rig.data.bones[n].parent_recursive) for n in order}
    sorted_bones = sorted(order, key=lambda b: depth[b])
    loc = {b: np.zeros((n, 3)) for b in order}
    rot = {b: np.zeros((n, 4)) for b in order}
    scl = {b: np.zeros((n, 3)) for b in order}
    root_loc = np.zeros((n, 3))
    root_rot = np.zeros((n, 4))
    root_scl = np.zeros((n, 3))
    prev_q = {}
    for f, frame in enumerate(frames):
        pose = {}
        for b in sorted_bones:
            pose[b] = conv(frame['bones'][index[b]]) @ fix[b]
            bone = rig.data.bones[b]
            if bone.parent:
                p = bone.parent.name
                basis = (pose[p] @ rest_b[p].inverted() @ rest_b[b]).inverted() @ pose[b]
            else:
                basis = rest_b[b].inverted() @ pose[b]
            l, q, s = basis.decompose()
            # Keep quaternions on one hemisphere so interpolation never flips.
            if b in prev_q and prev_q[b].dot(q) < 0:
                q.negate()
            prev_q[b] = q
            loc[b][f] = l
            rot[b][f] = (q.w, q.x, q.y, q.z)
            scl[b][f] = s
        l, q, s = conv(frame['root']).decompose()
        if f and Quaternion(root_rot[f - 1]).dot(q) < 0:
            q.negate()
        root_loc[f] = l
        root_rot[f] = (q.w, q.x, q.y, q.z)
        root_scl[f] = s

    def curves(id_data, name):
        ad = id_data.animation_data_create()
        act = bpy.data.actions.new(name)
        ad.action = act
        return act

    def write(act, id_data, path, values, group):
        frames_idx = np.arange(n, dtype=np.float32)
        for i in range(values.shape[1]):
            fc = act.fcurve_ensure_for_datablock(id_data, path, index=i, group_name=group)
            fc.keyframe_points.add(n)
            co = np.empty(2 * n, np.float32)
            co[0::2] = frames_idx
            co[1::2] = values[:, i]
            fc.keyframe_points.foreach_set('co', co)
            fc.keyframe_points.foreach_set('interpolation', np.full(n, 1, np.int32))  # LINEAR
            fc.update()

    act = curves(rig, 'GillyShowreel')
    # Gilly's bones only ever rotate; translation and scale stay at rest.
    for b in order:
        rig.pose.bones[b].location = (0, 0, 0)
        rig.pose.bones[b].scale = (1, 1, 1)
        write(act, rig, f'pose.bones["{b}"].rotation_quaternion', rot[b], b)
    write(act, rig, 'location', root_loc, 'Root')
    write(act, rig, 'rotation_quaternion', root_rot, 'Root')
    write(act, rig, 'scale', root_scl, 'Root')
    keys = mesh.data.shape_keys
    if keys and data.get('morphs'):
        kact = curves(keys, 'GillyMouth')
        m = np.array([fr['morphs'] for fr in frames], np.float32)
        for i, name in enumerate(data['morphs']):
            if name in keys.key_blocks:
                write(kact, keys, f'key_blocks["{name}"].value', m[:, i:i + 1], 'Mouth')
    scene = bpy.context.scene
    scene.render.fps = data['fps']
    scene.frame_start = 0
    scene.frame_end = n - 1
    log('showreel keyed:', n, 'frames,', len(order), 'bones')


def export_usdz(path, objs):
    """Exports USD, slims it for AR, and packages it as an ARKit-ready USDZ."""
    import shutil
    import tempfile
    for o in objs:
        if o.type == 'MESH':
            for attr in list(o.data.color_attributes):
                o.data.color_attributes.remove(attr)  # Baked into the texture already.
            for slot in o.material_slots:
                slot.material.use_backface_culling = True  # Closed meshes: single-sided.
    tmp = tempfile.mkdtemp(prefix='gilly-usd-')
    usdc = os.path.join(tmp, 'gilly.usdc')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.wm.usd_export(
        filepath=usdc, selected_objects_only=True, export_animation=True, export_armatures=True,
        export_shapekeys=True, only_deform_bones=False, export_materials=True, generate_preview_surface=True,
        export_textures_mode='NEW', overwrite_textures=True, relative_paths=True, export_uvmaps=True,
        export_normals=True, export_mesh_colors=False, export_custom_properties=False,
        convert_world_material=False, convert_orientation=True, export_global_forward_selection='NEGATIVE_Z',
        export_global_up_selection='Y', root_prim_path='/Gilly', evaluation_mode='RENDER', meters_per_unit=1.0)
    slim_usd(usdc)
    from pxr import UsdUtils
    if os.path.exists(path):
        os.remove(path)
    ok = UsdUtils.CreateNewARKitUsdzPackage(usdc, path)
    shutil.rmtree(tmp, ignore_errors=True)
    log('exported', path, os.path.getsize(path) // 1024, 'KB', 'ok' if ok else 'FAILED')


def slim_usd(usdc):
    """Smaller files for phones: per-vertex normals, constant animation channels
    written once, nothing Blender-specific."""
    from pxr import Usd, UsdGeom, UsdSkel, Sdf, Vt, Gf
    stage = Usd.Stage.Open(usdc)
    for prim in list(stage.Traverse()):
        if prim.GetTypeName() == 'DomeLight':
            stage.RemovePrim(prim.GetPath())
            continue
        for attr in prim.GetAttributes():
            if attr.GetName().startswith('userProperties:') or attr.GetName().startswith('primvars:blender'):
                prim.RemoveProperty(attr.GetName())
        if prim.IsA(UsdGeom.Mesh):
            mesh = UsdGeom.Mesh(prim)
            mesh.GetDoubleSidedAttr().Set(False)
            normals = mesh.GetNormalsAttr()
            if normals.HasValue() and mesh.GetNormalsInterpolation() == UsdGeom.Tokens.faceVarying:
                n = np.array(normals.Get(), np.float32)
                idx = np.array(mesh.GetFaceVertexIndicesAttr().Get(), np.int64)
                count = len(mesh.GetPointsAttr().Get())
                acc = np.zeros((count, 3), np.float32)
                np.add.at(acc, idx, n)
                acc /= np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-9)
                normals.Set(Vt.Vec3fArray.FromNumpy(acc))
                mesh.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
            api = UsdGeom.PrimvarsAPI(prim)
            for pv in api.GetPrimvars():
                if pv.GetPrimvarName() == 'Color':
                    api.RemovePrimvar('Color')
                ind = pv.GetIndicesAttr()
                if ind and ind.GetNumTimeSamples() == 1:
                    value = ind.Get(ind.GetTimeSamples()[0])
                    ind.Clear()
                    ind.Set(value)
        if prim.GetTypeName() == 'BlendShape':
            # Keep only the points a shape actually moves (the mouth), not all of them.
            offsets = prim.GetAttribute('offsets')
            indices = prim.GetAttribute('pointIndices')
            o = np.array(offsets.Get(), np.float32)
            i = np.array(indices.Get(), np.int32) if indices.HasValue() else np.arange(len(o), dtype=np.int32)
            keep = np.linalg.norm(o, axis=1) > 1e-7
            offsets.Set(Vt.Vec3fArray.FromNumpy(o[keep]))
            indices.Set(Vt.IntArray.FromNumpy(i[keep]))
        if prim.IsA(UsdSkel.Animation):
            anim = UsdSkel.Animation(prim)
            for attr in (anim.GetTranslationsAttr(), anim.GetScalesAttr()):
                times = attr.GetTimeSamples()
                if not times:
                    continue
                first = np.array(attr.Get(times[0]))
                constant = all(np.allclose(np.array(attr.Get(t)), first, atol=1e-5) for t in times)
                if constant:
                    value = attr.Get(times[0])
                    attr.Clear()
                    attr.Set(value)
    # Export, not Save: a fresh crate file without the replaced data.
    fresh = usdc.replace('.usdc', '-slim.usdc')
    stage.GetRootLayer().Export(fresh)
    os.replace(fresh, usdc)


def write_segments(data, path):
    lines = [
        "// Generated by blender/gilly.py --usdz: where each of Gilly's moods sits on the",
        "// USDZ's single animation timeline, in seconds. ar.js plays them by seeking.",
        'export const SEGMENTS = {',
    ]
    for s in data['segments']:
        lines.append(f"  {s['name']}: {{ start: {s['start']:.4f}, end: {s['end']:.4f}, loop: {str(s['loop']).lower()} }},")
    lines.append('};')
    lines.append(f"export const DURATION = {len(data['frames']) / data['fps']:.4f};")
    with open(path, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    log('wrote', path)


def contact_sheet(names, out, cols=3):
    imgs = [bpy.data.images.load(os.path.join(ARGS['out'], f'{n}.png')) for n in names]
    w, h = imgs[0].size
    rows = (len(imgs) + cols - 1) // cols
    sheet = np.ones((rows * h, cols * w, 4), np.float32)
    for i, im in enumerate(imgs):
        a = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
        r, c = divmod(i, cols)
        sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = a
    img = bpy.data.images.new('sheet', cols * w, rows * h)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = os.path.join(ARGS['out'], out)
    img.file_format = 'PNG'
    img.save()


def main():
    clear_scene()
    body, eyes = build_body(ARGS['voxel'])
    if ARGS.get('usdz'):
        decimate(body, 17000)  # Lighter for AR downloads; still smooth at arm's length.
    for c, d in eyes:
        log('eye', np.round(c, 4), np.round(d, 3))
    gills = build_gills(ARGS['voxel'] * 0.45)
    if ARGS.get('usdz'):
        for g in gills:
            decimate(g, 1700)
    eye_objs = build_eyes(eyes)
    mouth = build_mouth()
    lids = build_lids(eyes)
    paint_body(body)
    for i, g in enumerate(A.GILLS):
        paint_gill(gills[2 * i], g, 1)
        paint_gill(gills[2 * i + 1], g, -1)

    skin = material('Skin', 0.42, coat=0.2, sss=0.12)
    gill_mat = material('Gill', 0.5, sss=0.2)
    eye_mat = material('Eye', 0.2, coat=1.0, image=eye_texture())
    mouth_mat = material('Mouth', 0.6)
    body.data.materials.append(skin)
    for g in gills:
        g.data.materials.append(gill_mat)
    for e in eye_objs:
        e.data.materials.append(eye_mat)
    mouth.data.materials.append(mouth_mat)
    for lid in lids:
        lid.data.materials.append(skin)

    bake_ao([body, *gills, *lids])
    rig = build_armature(eyes)
    rig_everything(rig, body, gills, eye_objs, lids, mouth, eyes)
    rig_metadata(rig, eyes)
    for obj in [body, mouth, *gills, *eye_objs, *lids]:
        obj.data.name = obj.name
    if ARGS.get('export'):
        export_glb(os.path.join(ARGS['out'], 'gilly.glb'), [rig, body, mouth, *gills, *eye_objs, *lids])
    if ARGS.get('usdz'):
        import json
        with open(ARGS['usdz']) as f:
            data = json.load(f)
        skin_mesh = join_meshes([mouth, body, *gills, *lids], 'GillyBody')
        bake_color_texture(skin_mesh, 2048, os.path.join(ARGS['out'], 'gilly_color.jpg'))
        import_showreel(rig, skin_mesh, data)
        export_usdz(os.path.join(ARGS['out'], 'gilly.usdz'), [rig, skin_mesh, *eye_objs])
        write_segments(data, os.path.join(ARGS['out'], 'gilly-segments.js'))

    if ARGS['preview']:
        preview_setup()
        bpy.context.scene.render.engine = 'BLENDER_EEVEE'
        render('front', (0, -1.2, 0.145), ortho=0.36)
        render('three_quarter', (0.62, -0.95, 0.36), lens=70)
        render('side', (1.2, 0, 0.145), ortho=0.40)
        render('back', (-0.6, 0.95, 0.40), lens=70)
        render('face', (0.12, -0.75, 0.24), target=(0, 0, 0.19), lens=110)
        keys = mouth.data.shape_keys.key_blocks
        for name in ('Open', 'Grin', 'Smile'):
            keys[name].value = 1
            render(f'face_{name.lower()}', (0.12, -0.75, 0.24), target=(0, 0, 0.19), lens=110)
            keys[name].value = 0
        render('gills', (0.42, -0.30, 0.30), target=(0.09, 0.03, 0.21), lens=100)
        if ARGS.get('posetest'):
            pose_test(rig, eyes)
            render('pose_front', (0, -1.2, 0.145), ortho=0.40)
            render('pose_three', (0.62, -0.95, 0.36), lens=65)
            render('pose_back', (-0.6, 0.95, 0.40), lens=65)
            render('pose_face', (0.12, -0.75, 0.24), target=(0, 0, 0.19), lens=110)
            contact_sheet(['pose_front', 'pose_three', 'pose_back', 'pose_face'], 'pose_sheet.png', cols=4)
        contact_sheet(['front', 'three_quarter', 'side', 'back', 'face', 'face_open', 'face_grin', 'gills'], 'sheet.png', cols=4)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ARGS['out'], 'gilly.blend'))


main()
