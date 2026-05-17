// Build colored GLB from per-part STL files exported by OpenSCAD.
// Reads frame.stl / mat.stl / springs.stl / legs.stl from this folder,
// rotates Z-up → Y-up, stands the model on the floor (min.y = 0),
// gives each part its own PBR material, and writes trampoline.glb + .bin.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Vector3, BufferGeometry, BufferAttribute, EdgesGeometry, WireframeGeometry } from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { Document, WebIO } from '@gltf-transform/core';
import { weld, dedup, prune, quantize } from '@gltf-transform/functions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glbPath = path.join(__dirname, 'trampoline.glb');
const binPath = path.join(__dirname, 'trampoline.bin');

// Part definitions — neon-industrial palette.
const PARTS = [
    {
        file: 'frame_outer.stl',
        name: 'FrameOuter',
        // hot magenta — site's --hot accent, polished metal
        material: { color: [1.00, 0.18, 0.62, 1.0], metallic: 0.82, roughness: 0.16, emissive: [0.38, 0.02, 0.17] },
    },
    {
        file: 'frame_inner.stl',
        name: 'FrameInner',
        // dark purple — inner connector ring
        material: { color: [0.22, 0.04, 0.42, 1.0], metallic: 0.50, roughness: 0.38, emissive: [0.07, 0.00, 0.14] },
    },
    {
        file: 'mat.stl',
        name: 'Mat',
        // near-black matte fabric/kevlar
        material: { color: [0.03, 0.03, 0.04, 1.0], metallic: 0.0, roughness: 0.92, emissive: [0.00, 0.00, 0.00] },
    },
    {
        file: 'springs.stl',
        name: 'Springs',
        // near-black with faint metallic sheen
        material: { color: [0.06, 0.04, 0.07, 1.0], metallic: 0.22, roughness: 0.65, emissive: [0.00, 0.00, 0.00] },
    },
    {
        file: 'legs_tube.stl',
        name: 'LegsTube',
        // same hot magenta as outer frame
        material: { color: [1.00, 0.18, 0.62, 1.0], metallic: 0.82, roughness: 0.16, emissive: [0.38, 0.02, 0.17] },
    },
    {
        file: 'legs_feet.stl',
        name: 'LegsFeet',
        // dark rubber — near-black with purple tint, matte
        material: { color: [0.10, 0.05, 0.16, 1.0], metallic: 0.0, roughness: 0.92, emissive: [0.00, 0.00, 0.00] },
    },
];

// First pass: gather geometries + global bounding box (after Y-up rotation
// and cm → m scaling so model-viewer's metric camera-target works as expected).
const stl = new STLLoader();
const partGeoms = [];
const globalBox = new Box3();
const SCALE = 0.01; // OpenSCAD cm → glTF meters
let totalVerts = 0;

for (const p of PARTS) {
    const full = path.join(__dirname, p.file);
    if (!fs.existsSync(full)) { console.error('missing:', full); process.exit(1); }
    const buf = fs.readFileSync(full);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const g = stl.parse(ab);
    // OpenSCAD Z-up → glTF Y-up: rotate -90° around X.
    g.rotateX(-Math.PI / 2);
    g.scale(SCALE, SCALE, SCALE);
    g.computeVertexNormals();
    g.computeBoundingBox();
    globalBox.union(g.boundingBox);
    partGeoms.push({ part: p, geom: g });
    totalVerts += g.attributes.position.count;
}

// Center horizontally, stand on floor (min.y = 0).
const center = new Vector3();
globalBox.getCenter(center);
const offset = new Vector3(-center.x, -globalBox.min.y, -center.z);
for (const { geom } of partGeoms) {
    geom.translate(offset.x, offset.y, offset.z);
}

console.log(`Parts: ${PARTS.length}  total vertices: ${totalVerts.toLocaleString()}`);

// --- Build glTF document ---
const doc = new Document();
const buffer = doc.createBuffer();
const node = doc.createNode('Trampoline');
const mesh = doc.createMesh('Trampoline');
node.setMesh(mesh);
const scene = doc.createScene('Scene').addChild(node);
doc.getRoot().setDefaultScene(scene);

// Wireframe material — fully invisible in the GLB. The showcase section
// uses three.js directly and replaces this material with a custom shader
// that reveals lines around the cursor; the hero uses model-viewer and
// keeps them hidden (alpha = 0).
const { KHRMaterialsUnlit } = await import('@gltf-transform/extensions');
const unlit = doc.createExtension(KHRMaterialsUnlit);
const wireMat = doc.createMaterial('Wireframe')
    .setBaseColorFactor([1.0, 0.18, 0.65, 0.0])
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setAlphaMode('BLEND')
    .setDoubleSided(true)
    .setExtension('KHR_materials_unlit', unlit.createUnlit());

for (const { part, geom } of partGeoms) {
    const posAcc = doc.createAccessor(`${part.name}_POS`)
        .setType('VEC3')
        .setArray(new Float32Array(geom.attributes.position.array))
        .setBuffer(buffer);
    const normAcc = doc.createAccessor(`${part.name}_NORM`)
        .setType('VEC3')
        .setArray(new Float32Array(geom.attributes.normal.array))
        .setBuffer(buffer);

    const m = part.material;
    const mat = doc.createMaterial(part.name)
        .setBaseColorFactor(m.color)
        .setMetallicFactor(m.metallic)
        .setRoughnessFactor(m.roughness)
        .setEmissiveFactor(m.emissive);

    const prim = doc.createPrimitive()
        .setAttribute('POSITION', posAcc)
        .setAttribute('NORMAL', normAcc)
        .setMaterial(mat);
    mesh.addPrimitive(prim);

    // Wireframe pass — line primitive for the GLB. EdgesGeometry filters
    // by feature-angle which is great for hard-edged parts (frame, mat,
    // springs) but leaves smooth conical legs nearly bare. For Legs use
    // WireframeGeometry to keep all triangulation edges.
    // Smooth-ish parts (legs are conical, mat is a flat disc) only have a
    // couple of feature edges — fall back to full WireframeGeometry there
    // so the scan-grid still has lines to light up.
    const useWireframe = ['LegsTube', 'LegsFeet', 'Mat'].includes(part.name);
    const edgeGeom = useWireframe
        ? new WireframeGeometry(geom)
        : new EdgesGeometry(geom, 18);
    const edgePosSrc = edgeGeom.attributes.position.array;
    const edgePos = new Float32Array(edgePosSrc.length);

    // Push each line vertex slightly outward from this part's centre so the
    // edges don't get z-fought back behind the mesh surface (1.5 mm offset).
    geom.computeBoundingBox();
    const partCenter = new Vector3();
    geom.boundingBox.getCenter(partCenter);
    const OFFSET = 0.0015;

    for (let i = 0; i < edgePosSrc.length; i += 3) {
        const dx = edgePosSrc[i]     - partCenter.x;
        const dy = edgePosSrc[i + 1] - partCenter.y;
        const dz = edgePosSrc[i + 2] - partCenter.z;
        const len = Math.hypot(dx, dy, dz);
        if (len > 1e-6) {
            const k = (len + OFFSET) / len;
            edgePos[i]     = partCenter.x + dx * k;
            edgePos[i + 1] = partCenter.y + dy * k;
            edgePos[i + 2] = partCenter.z + dz * k;
        } else {
            edgePos[i]     = edgePosSrc[i];
            edgePos[i + 1] = edgePosSrc[i + 1];
            edgePos[i + 2] = edgePosSrc[i + 2];
        }
    }

    const edgeAcc = doc.createAccessor(`${part.name}_EDGES`)
        .setType('VEC3')
        .setArray(edgePos)
        .setBuffer(buffer);

    const edgePrim = doc.createPrimitive()
        .setAttribute('POSITION', edgeAcc)
        .setMaterial(wireMat)
        .setMode(1); // 1 = LINES
    mesh.addPrimitive(edgePrim);
}

// No quantize() — it can collapse LINES primitives whose endpoints
// fall into the same quantization bucket, killing the wireframe pass.
await doc.transform(
    weld({ tolerance: 0.00001 }),
    dedup(),
    prune(),
);

const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
const glb = await io.writeBinary(doc);

fs.writeFileSync(glbPath, Buffer.from(glb));
fs.writeFileSync(binPath, Buffer.from(glb));

const sizeKb = (glb.byteLength / 1024).toFixed(1);
console.log(`Wrote ${path.basename(glbPath)} and ${path.basename(binPath)} (${sizeKb} KB each)`);
