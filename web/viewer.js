import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { setupLighting } from './lighting.js';
import { createBoneMaterial, fitCameraToSkeleton } from './skeleton.js';
import { buildVesselStructures, vesselStructureNames } from './vessels.js';
import { organStructureNames, placeOrganStructures } from './organs.js';
import { registerReferenceToScan } from './registration.js';
import { loadMuscleStructures, muscleStructureNames } from './muscles.js';
import { loadNerveStructures, nerveStructureNames } from './nerves.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#viewer');
const loadState = $('#load-state');
const scene = new THREE.Scene();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
} catch (error) {
  loadState.innerHTML = '<span class="error">WebGL is unavailable in this browser.</span>';
  throw error;
}
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(0, 0.05, 3.65);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 1.8;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.95;
controls.screenSpacePanning = true;
controls.update();
setupLighting(renderer, scene);

const anatomyRoot = new THREE.Group();
scene.add(anatomyRoot);
const namedAnatomyRoot = new THREE.Group();
namedAnatomyRoot.name = 'Registered anatomy layers';
anatomyRoot.add(namedAnatomyRoot);
const anatomyLabelDefinitions = {
  Lung_R: { text: 'RIGHT LUNG', x: -58, y: -9, align: 'right' },
  Lung_L: { text: 'LEFT LUNG', x: 58, y: -9, align: 'left' },
  Heart: { text: 'HEART', x: 58, y: 32, align: 'left' },
  Liver: { text: 'LIVER', x: -58, y: -7, align: 'right' },
  Stomach: { text: 'STOMACH', x: 58, y: -7, align: 'left' },
  Kidney_R: { text: 'RIGHT KIDNEY', x: -56, y: 0, align: 'right' },
  Kidney_L: { text: 'LEFT KIDNEY', x: 56, y: 0, align: 'left' },
  Bladder: { text: 'BLADDER', x: 0, y: 25, align: 'center' },
  Trachea: { text: 'TRACHEA', x: 0, y: -21, align: 'center' },
  Gallbladder: { text: 'GALLBLADDER', x: -58, y: 10, align: 'right' },
  Pancreas: { text: 'PANCREAS', x: 58, y: 9, align: 'left' },
  Spleen: { text: 'SPLEEN', x: -58, y: 17, align: 'right' },
  Small_Intestine: { text: 'SMALL INTESTINE', x: 58, y: -14, align: 'left' },
  Large_Intestine: { text: 'LARGE INTESTINE', x: -58, y: -21, align: 'right' },
  Esophagus: { text: 'ESOPHAGUS', x: 58, y: 17, align: 'left' },
};
const layerDefinitions = [
  { id: 'skeleton', label: 'Skeleton', color: '#cbd5df', visible: true, matches: (record) => record.name === 'Human skeleton' },
  { id: 'organs', label: 'Organs', color: '#cf7a82', visible: true, matches: (record) => organStructureNames.has(record.name) },
  { id: 'vessels', label: 'Vessels', color: '#e96773', visible: true, matches: (record) => vesselStructureNames.has(record.name) },
  { id: 'muscles', label: 'Muscles', color: '#a65b50', visible: false, loaded: false, loading: false, opacity: 1, matches: (record) => muscleStructureNames.has(record.name) },
  { id: 'nerves', label: 'Nerves', color: '#d3bd68', visible: false, loaded: false, loading: false, matches: (record) => nerveStructureNames.has(record.name) },
];
const anatomyLabelNodes = new Map();
const anatomyLeaderLines = new Map();
const anatomyLabelMeshes = [];
const categoryDefinitions = [
  { id: 'skeleton', label: 'Skeleton', color: '#cbd5df' },
  { id: 'cardiovascular', label: 'Cardiovascular', color: '#e96773' },
  { id: 'respiratory', label: 'Respiratory', color: '#cf7a82' },
  { id: 'digestive', label: 'Digestive', color: '#dc9454' },
  { id: 'urinary', label: 'Urinary', color: '#bd78be' },
  { id: 'endocrine', label: 'Endocrine', color: '#d3a56e' },
  { id: 'lymphatic', label: 'Lymphatic', color: '#b67e9a' },
  { id: 'muscular', label: 'Muscular', color: '#a65b50' },
  { id: 'nervous', label: 'Nervous', color: '#d3bd68' },
];
const categoryById = Object.fromEntries(categoryDefinitions.map((category) => [category.id, category]));
const structureMeta = {
  'Human skeleton': { category: 'skeleton', location: 'Full body; axial and appendicular skeleton.', function: 'Supports the body, protects internal organs, and provides attachment points for movement.', description: 'This scan based mesh is the supplied Blender scene exported for browser rendering. The source scene contains one joined skeleton mesh, so individual bones are not separately selectable in this scan.' },
  Heart: { category: 'cardiovascular', location: 'Thoracic cavity, between the lungs and slightly left of midline.', function: 'Moves blood through the pulmonary and systemic circulations.', description: 'Joined right and left atrial and ventricular meshes from the Z-Anatomy model set.' },
  Lung_L: { category: 'respiratory', location: 'Left side of the thoracic cavity.', function: 'Exchanges oxygen and carbon dioxide between air and blood.', description: 'The left lung includes separate superior and inferior lobes with the cardiac notch represented in its source geometry.' },
  Lung_R: { category: 'respiratory', location: 'Right side of the thoracic cavity.', function: 'Exchanges oxygen and carbon dioxide between air and blood.', description: 'The right lung includes separate superior, middle, and inferior lobes.' },
  Liver: { category: 'digestive', location: 'Upper abdomen, predominantly on the right beneath the diaphragm.', function: 'Processes absorbed nutrients and produces bile, among other metabolic roles.', description: 'An adapted Z-Anatomy liver mesh positioned from the rib-cage and abdominal landmarks.' },
  Gallbladder: { category: 'digestive', location: 'Undersurface of the liver on the right.', function: 'Stores and concentrates bile.', description: 'An adapted Z-Anatomy gallbladder mesh.' },
  Stomach: { category: 'digestive', location: 'Upper abdomen on the left, below the diaphragm.', function: 'Stores food and begins mechanical and chemical digestion.', description: 'An adapted, curved Z-Anatomy stomach mesh.' },
  Pancreas: { category: 'digestive', location: 'Upper abdomen, posterior to the stomach.', function: 'Produces digestive enzymes and hormones including insulin.', description: 'An adapted Z-Anatomy pancreas mesh.' },
  Spleen: { category: 'lymphatic', location: 'Upper left abdomen, lateral to the stomach.', function: 'Filters blood and supports immune function.', description: 'An adapted Z-Anatomy spleen mesh.' },
  Kidney_L: { category: 'urinary', location: 'Posterior upper abdomen on the left, beside the lower thoracic spine.', function: 'Filters blood and contributes to fluid, electrolyte, and acid-base regulation.', description: 'The left kidney mesh is positioned posteriorly using vertebral and pelvic landmarks.' },
  Kidney_R: { category: 'urinary', location: 'Posterior upper abdomen on the right, beside the lower thoracic spine.', function: 'Filters blood and contributes to fluid, electrolyte, and acid-base regulation.', description: 'The right kidney mesh is positioned posteriorly using vertebral and pelvic landmarks.' },
  Adrenal_L: { category: 'endocrine', location: 'Superior pole of the left kidney.', function: 'Produces hormones involved in stress response, metabolism, and blood pressure regulation.', description: 'The left suprarenal gland mesh from Z-Anatomy.' },
  Adrenal_R: { category: 'endocrine', location: 'Superior pole of the right kidney.', function: 'Produces hormones involved in stress response, metabolism, and blood pressure regulation.', description: 'The right suprarenal gland mesh from Z-Anatomy.' },
  Bladder: { category: 'urinary', location: 'Pelvis, behind the pubic symphysis.', function: 'Stores urine before it is released from the body.', description: 'An adapted Z-Anatomy bladder mesh positioned within the measured pelvic landmarks.' },
  Small_Intestine: { category: 'digestive', location: 'Central abdomen, between the stomach and large intestine.', function: 'Completes digestion and absorbs most nutrients.', description: 'The available Z-Anatomy subset combines the duodenum and jejunum; an ileum mesh is not included in this source asset.' },
  Large_Intestine: { category: 'digestive', location: 'Frames the small intestine through the abdomen.', function: 'Absorbs water and forms stool.', description: 'Joined ascending, transverse, descending, and sigmoid colon meshes.' },
  Trachea: { category: 'respiratory', location: 'Midline neck and upper thorax, anterior to the esophagus.', function: 'Conducts air between the larynx and the bronchi.', description: 'An adapted Z-Anatomy trachea mesh.' },
  Bronchi: { category: 'respiratory', location: 'Thorax, branching from the trachea toward both lungs.', function: 'Conducts air into the right and left lungs.', description: 'Joined main and lobar bronchus meshes from Z-Anatomy.' },
  Esophagus: { category: 'digestive', location: 'Posterior to the trachea, extending through the thorax.', function: 'Moves swallowed food and liquid toward the stomach.', description: 'An adapted Z-Anatomy esophagus mesh.' },
  Brain: { category: 'nervous', location: 'Cranial cavity.', function: 'Integrates sensory input and coordinates movement, cognition, and vital functions.', description: 'Grouped cerebral and brainstem structures adapted from the Z-Anatomy nervous system.' },
  Spinal_Cord: { category: 'nervous', location: 'Vertebral canal, from the brainstem into the upper lumbar region.', function: 'Relays signals between the brain and body and coordinates spinal reflexes.', description: 'Grouped spinal-cord gray and white matter structures from Z-Anatomy.' },
  Cranial_Nerves: { category: 'nervous', location: 'Base of the brain, extending through the head and neck.', function: 'Carry sensory and motor signals between the brain and the head, neck, and organs.', description: 'Joined major cranial nerve structures from the Z-Anatomy source.' },
  Brachial_Plexus_L: { category: 'nervous', location: 'Left lower neck, shoulder, and upper limb.', function: 'Carries motor and sensory signals between the spinal cord and the left upper limb.', description: 'Grouped left brachial plexus roots, trunks, cords, and major branches.' },
  Brachial_Plexus_R: { category: 'nervous', location: 'Right lower neck, shoulder, and upper limb.', function: 'Carries motor and sensory signals between the spinal cord and the right upper limb.', description: 'Grouped right brachial plexus roots, trunks, cords, and major branches.' },
  Lumbar_Plexus_L: { category: 'nervous', location: 'Left posterior abdominal wall.', function: 'Supplies nerves to the left lower abdominal wall and anterior thigh.', description: 'Grouped left lumbar plexus structures from the Z-Anatomy source.' },
  Lumbar_Plexus_R: { category: 'nervous', location: 'Right posterior abdominal wall.', function: 'Supplies nerves to the right lower abdominal wall and anterior thigh.', description: 'Grouped right lumbar plexus structures from the Z-Anatomy source.' },
  Sacral_Plexus_L: { category: 'nervous', location: 'Left posterior pelvis.', function: 'Forms major nerves supplying the left pelvis and lower limb.', description: 'Grouped left sacral plexus structures, excluding the separately selectable sciatic nerve.' },
  Sacral_Plexus_R: { category: 'nervous', location: 'Right posterior pelvis.', function: 'Forms major nerves supplying the right pelvis and lower limb.', description: 'Grouped right sacral plexus structures, excluding the separately selectable sciatic nerve.' },
  Sciatic_Nerve_L: { category: 'nervous', location: 'Left posterior pelvis and thigh, continuing toward the lower leg.', function: 'Provides major motor and sensory pathways to the left lower limb.', description: 'Grouped left sciatic nerve and its major tibial and common fibular continuations.' },
  Sciatic_Nerve_R: { category: 'nervous', location: 'Right posterior pelvis and thigh, continuing toward the lower leg.', function: 'Provides major motor and sensory pathways to the right lower limb.', description: 'Grouped right sciatic nerve and its major tibial and common fibular continuations.' },
  Aorta_Central: { category: 'cardiovascular', location: 'Central thorax and abdomen.', function: 'Carries oxygenated blood from the heart to the systemic circulation.', description: 'A landmark-driven educational path through the thorax and abdomen.' },
  VenaCava_Central: { category: 'cardiovascular', location: 'Central thorax and abdomen.', function: 'Returns systemic venous blood toward the heart.', description: 'A landmark-driven educational return path through the abdomen and thorax.' },
  Carotid_L: { category: 'cardiovascular', location: 'Left side of the neck.', function: 'Supplies arterial blood toward the head and neck.', description: 'A simplified carotid path generated from the skeleton landmarks.' },
  Carotid_R: { category: 'cardiovascular', location: 'Right side of the neck.', function: 'Supplies arterial blood toward the head and neck.', description: 'A simplified carotid path generated from the skeleton landmarks.' },
  Artery_Arm_L: { category: 'cardiovascular', location: 'Left upper limb.', function: 'Represents an arterial pathway supplying the left upper limb.', description: 'A simplified, tapered arm artery path generated from the skeleton landmarks.' },
  Vein_Arm_L: { category: 'cardiovascular', location: 'Left upper limb.', function: 'Represents a venous pathway returning blood from the left upper limb.', description: 'A simplified, tapered arm vein path returning toward the vena cava.' },
  Artery_Arm_R: { category: 'cardiovascular', location: 'Right upper limb.', function: 'Represents an arterial pathway supplying the right upper limb.', description: 'A simplified, tapered arm artery path generated from the skeleton landmarks.' },
  Vein_Arm_R: { category: 'cardiovascular', location: 'Right upper limb.', function: 'Represents a venous pathway returning blood from the right upper limb.', description: 'A simplified, tapered arm vein path returning toward the vena cava.' },
  Artery_Leg_L: { category: 'cardiovascular', location: 'Left lower limb.', function: 'Represents an arterial pathway supplying the left lower limb.', description: 'A simplified, tapered leg artery path generated from the skeleton landmarks.' },
  Vein_Leg_L: { category: 'cardiovascular', location: 'Left lower limb.', function: 'Represents a venous pathway returning blood from the left lower limb.', description: 'A simplified, tapered leg vein path returning toward the vena cava.' },
  Artery_Leg_R: { category: 'cardiovascular', location: 'Right lower limb.', function: 'Represents an arterial pathway supplying the right lower limb.', description: 'A simplified, tapered leg artery path generated from the skeleton landmarks.' },
  Vein_Leg_R: { category: 'cardiovascular', location: 'Right lower limb.', function: 'Represents a venous pathway returning blood from the right lower limb.', description: 'A simplified, tapered leg vein path returning toward the vena cava.' },
};
const muscleGroupInfo = {
  Neck: ['neck', 'Moves and stabilizes the head and cervical spine.'],
  Pectorals: ['chest', 'Moves the upper arm and supports shoulder motion.'],
  Deltoids: ['shoulder', 'Raises and rotates the upper arm.'],
  Biceps: ['anterior upper arm', 'Flexes the elbow and assists forearm supination.'],
  Triceps: ['posterior upper arm', 'Extends the elbow and supports shoulder motion.'],
  Forearm: ['forearm', 'Moves the wrist and fingers.'],
  Abdominals: ['anterior abdominal wall', 'Supports trunk flexion and abdominal wall stability.'],
  Obliques: ['lateral abdominal wall', 'Rotates and laterally flexes the trunk.'],
  Trapezius: ['upper back and neck', 'Moves and stabilizes the scapula and neck.'],
  Latissimus: ['back', 'Extends, adducts, and internally rotates the upper arm.'],
  Glutes: ['hip', 'Extends and stabilizes the hip.'],
  Quadriceps: ['anterior thigh', 'Extends the knee and supports hip flexion.'],
  Hamstrings: ['posterior thigh', 'Flexes the knee and extends the hip.'],
  Calves: ['posterior lower leg', 'Plantar-flexes the ankle and supports gait.'],
};
for (const name of muscleStructureNames) {
  const [group, sideCode] = name.split('_');
  const [region, functionDescription] = muscleGroupInfo[group];
  const side = sideCode === 'L' ? 'left' : 'right';
  structureMeta[name] = {
    category: 'muscular',
    location: `${side[0].toUpperCase()}${side.slice(1)} ${region}.`,
    function: functionDescription,
    description: `Joined ${side} ${group.toLowerCase()} meshes adapted from the Z-Anatomy muscular system.`,
  };
}
const displayNames = {
  'Human skeleton': 'Full skeleton scan', Lung_L: 'Left lung', Lung_R: 'Right lung',
  Kidney_L: 'Left kidney', Kidney_R: 'Right kidney', Aorta_Central: 'Aorta',
  Adrenal_L: 'Left adrenal gland', Adrenal_R: 'Right adrenal gland',
  Small_Intestine: 'Small intestine', Large_Intestine: 'Large intestine',
  Esophagus: 'Esophagus',
  VenaCava_Central: 'Vena cava', Carotid_L: 'Left carotid artery', Carotid_R: 'Right carotid artery',
  Artery_Arm_L: 'Left arm artery', Artery_Arm_R: 'Right arm artery',
  Vein_Arm_L: 'Left arm vein', Vein_Arm_R: 'Right arm vein',
  Artery_Leg_L: 'Left leg artery', Artery_Leg_R: 'Right leg artery',
  Vein_Leg_L: 'Left leg vein', Vein_Leg_R: 'Right leg vein',
  Cranial_Nerves: 'Cranial nerves',
  Brachial_Plexus_L: 'Left brachial plexus', Brachial_Plexus_R: 'Right brachial plexus',
  Lumbar_Plexus_L: 'Left lumbar plexus', Lumbar_Plexus_R: 'Right lumbar plexus',
  Sacral_Plexus_L: 'Left sacral plexus', Sacral_Plexus_R: 'Right sacral plexus',
  Sciatic_Nerve_L: 'Left sciatic nerve', Sciatic_Nerve_R: 'Right sciatic nerve',
  Spinal_Cord: 'Spinal cord',
};
const muscleDisplayGroups = {
  Neck: 'neck muscles', Pectorals: 'pectorals', Deltoids: 'deltoids',
  Biceps: 'biceps', Triceps: 'triceps', Forearm: 'forearm muscles',
  Abdominals: 'abdominal muscles', Obliques: 'obliques', Trapezius: 'trapezius',
  Latissimus: 'latissimus', Glutes: 'gluteal muscles', Quadriceps: 'quadriceps',
  Hamstrings: 'hamstrings', Calves: 'calf muscles',
};
for (const name of muscleStructureNames) {
  const [group, side] = name.split('_');
  displayNames[name] = `${side === 'L' ? 'Left' : 'Right'} ${muscleDisplayGroups[group]}`;
}
const systems = new Map(categoryDefinitions.map((category) => [category.id, { ...category, visible: true, group: new THREE.Group(), structures: [] }]));
for (const system of systems.values()) {
  system.group.name = system.label;
  (system.id === 'skeleton' ? anatomyRoot : namedAnatomyRoot).add(system.group);
}

const structures = new Map();
const muscleLayer = layerDefinitions.find((layer) => layer.id === 'muscles');
const nerveLayer = layerDefinitions.find((layer) => layer.id === 'nerves');
let anatomyReady = false;
let muscleLoadPromise = null;
let nerveLoadPromise = null;
let currentRegistration = null;
let skullReferenceBounds = null;
let selectedRecord = null;
let hoveredRecord = null;
let cameraFraming = 'torso';
let activeCategoryFilter = null;
let labelsEnabled = true;
let measureMode = false;
let measurePoints = [];
let measureObjects = [];
let isolatedKey = null;
let tourIndex = -1;
let toastTimer = 0;
const annotation = $('#annotation');
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.018;
const pointer = new THREE.Vector2();
const annotationProjectionPoint = new THREE.Vector3();
const anatomyLabelProjectionPoint = new THREE.Vector3();

function friendlyName(name) {
  if (displayNames[name]) return displayNames[name];
  if (name === 'Human skeleton') return 'Full skeleton scan';
  const side = name.endsWith('_L') ? ' (Left)' : name.endsWith('_R') ? ' (Right)' : '';
  return name.replace(/_(L|R)$/, '').replaceAll('_', ' ') + side;
}
function metadataFor(name) {
  if (structureMeta[name]) return structureMeta[name];
  const match = name.match(/^(Artery|Vein)_(Arm|Leg)_([LR])$/);
  if (match) {
    const system = 'cardiovascular';
    const [_, vessel, region, side] = match;
    const limb = region === 'Arm' ? 'upper' : 'lower';
    const laterality = side === 'L' ? 'left' : 'right';
    return { category: system, location: `${laterality[0].toUpperCase()}${laterality.slice(1)} ${limb} limb.`, function: `Represents a ${vessel.toLowerCase()} pathway in the ${laterality} ${limb} limb.`, description: 'A simplified pathway included in the supplied anatomy model.' };
  }
  return null;
}
function recordFromObject(name, object, category, root = object) {
  if (!name || structures.has(name) || !metadataFor(name)) return structures.get(name);
  const metadata = metadataFor(name);
  const system = systems.get(category || metadata.category);
  if (!system) return null;
  const record = { key: name, name, displayName: friendlyName(name), system, root, meshes: [], visible: true, opacity: 1, initialMaterials: new Map(), opacityMaterials: new Map(), bounds: new THREE.Box3() };
  root.userData.structureKey = name;
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals();
    child.userData.structureKey = name;
    child.castShadow = true;
    child.receiveShadow = true;
    record.meshes.push(child);
    record.initialMaterials.set(child, child.material);
  });
  structures.set(name, record);
  system.structures.push(record);
  system.group.add(root);
  root.updateMatrixWorld(true);
  record.bounds.setFromObject(root);
  return record;
}

function setLoadText(message, error = false) {
  loadState.classList.toggle('error', error);
  loadState.innerHTML = error ? `<span>${message}</span>` : `<span class="spinner"></span><span>${message}</span>`;
}
function setLoadedLayerText() {
  const loadedLayers = [muscleLayer, nerveLayer].filter((layer) => layer.loaded).map((layer) => layer.label.toLowerCase());
  const layerText = loadedLayers.length ? ` · ${loadedLayers.join(' and ')} loaded` : '';
  const rms = currentRegistration ? Math.round(currentRegistration.rmsError * 1000) : 0;
  setLoadText(`${structures.size} structures${layerText} · landmark fit RMS ${rms} mm · Artec scan CC BY 3.0`);
}
function installSkeleton(gltf) {
  const root = gltf.scene;
  root.name = 'Human skeleton';
  root.userData.structureKey = 'Human skeleton';
  const boneMaterial = createBoneMaterial();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.material.dispose();
    object.material = boneMaterial;
    object.castShadow = true;
    object.receiveShadow = true;
    object.renderOrder = 1;
    object.userData.structureKey = 'Human skeleton';
  });
  recordFromObject('Human skeleton', root, 'skeleton', root);
  cameraFraming = 'torso';
  fitCameraToSkeleton(root, camera, controls, cameraFraming);
  buildSystemControls();
  buildStructureBrowser();
  updateStructureCount();
  setLoadText('Loading named anatomical structures…');
}
function loadSkeleton() {
  return new Promise((resolve, reject) => {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load('/assets/anatomy/skeleton_scan.glb', (gltf) => {
      draco.dispose();
      installSkeleton(gltf);
      resolve();
    }, (event) => {
      if (event.total) setLoadText(`Loading scan mesh · ${Math.round(event.loaded / event.total * 100)}%`);
    }, (error) => { draco.dispose(); reject(error); });
  });
}
function loadNamedAnatomy() {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();
    const organDraco = new DRACOLoader();
    organDraco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
    const organLoader = new GLTFLoader();
    organLoader.setDRACOLoader(organDraco);
    const loadObj = new Promise((loadResolve, loadReject) => {
      loader.load('/assets/anatomy/mediview_anatomy.obj', loadResolve, undefined, loadReject);
    });
    const loadOrgans = new Promise((loadResolve, loadReject) => {
      organLoader.load(
        '/assets/anatomy/organs.glb',
        (gltf) => { organDraco.dispose(); loadResolve(gltf); },
        undefined,
        (error) => { organDraco.dispose(); loadReject(error); },
      );
    });
    Promise.all([loadObj, loadOrgans]).then(([root, organs]) => {
      root.updateMatrixWorld(true);
      const skullReference = root.getObjectByName('Skull_Cranium');
      if (!skullReference) throw new Error('The anatomy reference is missing the Skull_Cranium landmark.');
      skullReferenceBounds = new THREE.Box3().setFromObject(skullReference);
      const scanRoot = structures.get('Human skeleton')?.root;
      if (!scanRoot) throw new Error('The skeleton scan must load before its anatomy landmarks can be registered.');
      const registration = registerReferenceToScan(root, scanRoot);
      namedAnatomyRoot.matrixAutoUpdate = false;
      namedAnatomyRoot.matrix.copy(registration.matrix);
      anatomyRoot.updateMatrixWorld(true);
      namedAnatomyRoot.updateMatrixWorld(true);
      placeOrganStructures(organs, root, registration);
      const inverseRegistration = namedAnatomyRoot.matrixWorld.clone().invert();
      for (const object of [...organs.scene.children]) {
        if (!organStructureNames.has(object.name)) continue;
        const meta = metadataFor(object.name);
        if (!meta) continue;
        const registeredRoot = new THREE.Group();
        registeredRoot.name = object.name;
        registeredRoot.matrixAutoUpdate = false;
        registeredRoot.matrix.copy(inverseRegistration);
        registeredRoot.add(object);
        recordFromObject(object.name, registeredRoot, meta.category, registeredRoot);
      }
      buildVesselStructures({
        sourceRoot: root,
        skeletonRoot: scanRoot,
        registrationRoot: namedAnatomyRoot,
        structures,
        register: (name, vesselRoot) => recordFromObject(name, vesselRoot, 'cardiovascular'),
      });
      buildSystemControls();
      buildStructureBrowser();
      updateStructureCount();
      buildAnatomyLabels();
      currentRegistration = registration;
      anatomyReady = true;
      resolve(registration);
    }).catch(reject);
  });
}

function loadMuscleLayer() {
  if (muscleLoadPromise) return muscleLoadPromise;
  muscleLoadPromise = loadMuscleStructures().then((roots) => {
    for (const root of roots) recordFromObject(root.name, root, 'muscular');
    muscleLayer.loaded = true;
    muscleLayer.loading = false;
    $('#muscle-opacity-control').hidden = false;
    buildLayerControls();
    buildSystemControls();
    buildStructureBrowser();
    updateStructureCount();
    applyVisibility();
    setLoadedLayerText();
    return roots;
  }).catch((error) => {
    muscleLoadPromise = null;
    muscleLayer.loading = false;
    muscleLayer.visible = false;
    buildLayerControls();
    console.error('Muscle model load failed', error);
    setLoadText(`Muscle layer could not be loaded: ${error.message || 'check the asset and refresh.'}`, true);
    throw error;
  });
  return muscleLoadPromise;
}

function loadNerveLayer() {
  if (nerveLoadPromise) return nerveLoadPromise;
  nerveLoadPromise = loadNerveStructures().then((roots) => {
    const brain = roots.find((root) => root.name === 'Brain');
    if (!brain || !skullReferenceBounds) throw new Error('The brain cannot be registered without the skull landmark.');
    const brainBounds = new THREE.Box3().setFromObject(brain);
    brain.position.add(skullReferenceBounds.getCenter(new THREE.Vector3()).sub(brainBounds.getCenter(new THREE.Vector3())));
    brain.updateMatrix();
    brain.updateMatrixWorld(true);
    for (const root of roots) recordFromObject(root.name, root, 'nervous');
    nerveLayer.loaded = true;
    nerveLayer.loading = false;
    buildLayerControls();
    buildSystemControls();
    buildStructureBrowser();
    updateStructureCount();
    applyVisibility();
    setLoadedLayerText();
    return roots;
  }).catch((error) => {
    nerveLoadPromise = null;
    nerveLayer.loading = false;
    nerveLayer.visible = false;
    buildLayerControls();
    console.error('Nerve model load failed', error);
    setLoadText(`Nerve layer could not be loaded: ${error.message || 'check the asset and refresh.'}`, true);
    throw error;
  });
  return nerveLoadPromise;
}

function loadLazyLayer(layer) {
  if (layer.id === 'muscles') return loadMuscleLayer();
  if (layer.id === 'nerves') return loadNerveLayer();
  return Promise.resolve([]);
}

function updateStructureCount() {
  const availableSystems = [...systems.values()].filter((system) => system.structures.length > 0);
  const count = structures.size;
  $('#structure-count').textContent = String(count).padStart(2, '0');
  $('#visible-count').textContent = `${availableSystems.length} systems`;
}
function layerForRecord(record) {
  return layerDefinitions.find((layer) => layer.matches?.(record));
}
function isRecordVisible(record) {
  const layer = layerForRecord(record);
  return record.visible && record.system.visible && (layer?.visible ?? true);
}
function buildLayerControls() {
  const container = $('#layer-list');
  container.replaceChildren();
  for (const layer of layerDefinitions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `layer-button${layer.available === false ? ' coming-soon' : ''}`;
    button.dataset.layer = layer.id;
    button.style.setProperty('--layer-color', layer.color);
    if (layer.available === false) {
      button.disabled = true;
      button.setAttribute('aria-label', `${layer.label}, coming soon`);
      button.title = `${layer.label} models are coming soon`;
      button.innerHTML = `<i class="layer-indicator" aria-hidden="true"></i><span class="layer-copy"><span>${layer.label}</span><small>Coming soon</small></span>`;
    } else {
      const waitingForAnatomy = ['muscles', 'nerves'].includes(layer.id) && !anatomyReady;
      const waitingForModel = layer.loading || waitingForAnatomy;
      button.disabled = waitingForModel;
      button.setAttribute('aria-pressed', String(layer.visible));
      button.setAttribute('aria-busy', String(layer.loading));
      button.title = waitingForAnatomy ? 'Preparing the anatomy reference' : `${layer.visible ? 'Hide' : 'Show'} ${layer.label}`;
      const status = layer.loading ? 'Loading…' : waitingForAnatomy ? 'Preparing…' : layer.visible ? 'Shown' : 'Hidden';
      button.innerHTML = `<i class="layer-indicator" aria-hidden="true"></i><span class="layer-copy"><span>${layer.label}</span><small>${status}</small></span>`;
      button.addEventListener('click', () => {
        if (['muscles', 'nerves'].includes(layer.id) && !layer.loaded) {
          layer.visible = true;
          layer.loading = true;
          setLoadText(`Loading the ${layer.label.toLowerCase()} layer…`);
          buildLayerControls();
          loadLazyLayer(layer).catch(() => {});
          return;
        }
        layer.visible = !layer.visible;
        applyVisibility();
        buildLayerControls();
        buildStructureBrowser();
      });
    }
    container.append(button);
  }
}
function buildSystemControls() {
  const container = $('#system-list');
  container.replaceChildren();
  for (const system of systems.values()) {
    if (!system.structures.length) continue;
    const button = document.createElement('button');
    button.className = 'system-chip-button';
    button.dataset.system = system.id;
    button.style.setProperty('--system-color', system.color);
    button.setAttribute('aria-pressed', String(system.visible));
    button.title = `${system.visible ? 'Hide' : 'Show'} ${system.label}; double-click to filter, right-click to isolate`;
    button.innerHTML = `<i class="system-indicator" aria-hidden="true"></i><span>${system.label}</span>`;
    button.addEventListener('click', () => {
      system.visible = !system.visible;
      button.setAttribute('aria-pressed', String(system.visible));
      applyVisibility();
      buildStructureBrowser();
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      for (const other of systems.values()) other.visible = other.id === system.id;
      buildSystemControls(); applyVisibility(); buildStructureBrowser();
    });
    container.append(button);
  }
  buildLayerControls();
}
function buildStructureBrowser() {
  const container = $('#structure-list');
  const query = $('#structure-search').value.trim().toLowerCase();
  const entries = [...structures.values()].filter((record) => {
    const matchesQuery = !query || record.displayName.toLowerCase().includes(query) || record.name.toLowerCase().includes(query) || record.system.label.toLowerCase().includes(query);
    const matchesCategory = !activeCategoryFilter || record.system.id === activeCategoryFilter;
    return matchesQuery && matchesCategory;
  }).sort((a, b) => a.system.label.localeCompare(b.system.label) || a.displayName.localeCompare(b.displayName));
  container.replaceChildren();
  let lastSystem = null;
  let group;
  for (const record of entries) {
    if (record.system.id !== lastSystem) {
      group = document.createElement('div'); group.className = 'structure-group';
      const heading = document.createElement('div'); heading.className = 'structure-group-title'; heading.textContent = record.system.label; group.append(heading); container.append(group); lastSystem = record.system.id;
    }
    const row = document.createElement('button');
    row.className = `structure-item${record === selectedRecord ? ' active' : ''}${isRecordVisible(record) ? '' : ' hidden-structure'}`;
    row.style.setProperty('--system-color', record.system.color);
    row.innerHTML = `<i class="structure-dot"></i><span>${record.displayName}</span><span class="eye">${record.visible ? '◉' : '○'}</span>`;
    row.title = `${record.displayName} · ${record.system.label}`;
    row.addEventListener('click', () => selectStructure(record));
    row.querySelector('.eye').addEventListener('click', (event) => {
      event.stopPropagation(); record.visible = !record.visible; applyVisibility(); buildStructureBrowser();
    });
    group.append(row);
  }
  $('#visible-count').textContent = `${entries.filter(isRecordVisible).length} shown`;
}
function applyVisibility() {
  for (const system of systems.values()) {
    system.group.visible = system.visible;
    for (const record of system.structures) record.root.visible = record.visible && (layerForRecord(record)?.visible ?? true);
  }
  if (isolatedKey) applyIsolation();
  updateAnnotation();
  updateAnatomyLabels();
}
function isAnatomyVisible(object) {
  for (let current = object; current && current !== anatomyRoot; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}
function updateStructureInfo(record) {
  selectedRecord = record;
  $('#empty-info').hidden = Boolean(record);
  $('#structure-info').hidden = !record;
  $('#clear-selection').hidden = !record;
  if (!record) { annotation.hidden = true; return; }
  const metadata = metadataFor(record.name);
  if (!metadata) return;
  $('#info-system').textContent = record.system.label;
  $('#info-system').style.setProperty('--system-color', record.system.color);
  $('#info-name').textContent = record.displayName;
  $('#info-location').textContent = metadata.location;
  $('#info-function').textContent = metadata.function;
  $('#info-description').textContent = metadata.description;
  const opacityPercent = Math.round(record.opacity * 100);
  $('#opacity-slider').value = String(opacityPercent);
  $('#opacity-value').textContent = `${opacityPercent}%`;
  buildStructureBrowser();
  updateAnnotation();
}
function selectStructure(record, { focus = true } = {}) {
  if (!record) return;
  const layer = layerForRecord(record);
  if (!record.visible || !record.system.visible || (layer && !layer.visible)) {
    record.visible = true;
    record.system.visible = true;
    if (layer) layer.visible = true;
    buildSystemControls();
    applyVisibility();
  }
  clearHighlight();
  selectedRecord = record;
  setHighlight(record, true);
  if (isolatedKey) { isolatedKey = record.key; applyIsolation(); }
  updateStructureInfo(record);
  updateAnatomyLabels();
  if (focus) focusRecord(record);
}
function setHighlight(record, enabled) {
  if (enabled) {
    for (const mesh of record.meshes) {
      const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const highlighted = current.map((material) => {
        const copy = material.clone();
        if ('emissive' in copy) { copy.emissive.set(0x16a987); copy.emissiveIntensity = 0.32; }
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? highlighted : highlighted[0];
    }
    return;
  }
  for (const mesh of record.meshes) {
    const source = record.initialMaterials.get(mesh);
    const opacityCopies = record.opacityMaterials.get(mesh) ?? [];
    const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    current.forEach((material) => {
      if (material !== source && !opacityCopies.includes(material)) material?.dispose?.();
    });
  }
  applyRecordOpacity(record);
}
function applyRecordOpacity(record) {
  const layerOpacity = muscleStructureNames.has(record.name) ? muscleLayer.opacity : 1;
  const opacity = record.opacity * layerOpacity;
  for (const mesh of record.meshes) {
    const source = record.initialMaterials.get(mesh);
    if (opacity >= 0.999) {
      mesh.material = source;
      continue;
    }
    let copies = record.opacityMaterials.get(mesh);
    if (!copies) {
      const materials = Array.isArray(source) ? source : [source];
      copies = materials.map((material) => material.clone());
      record.opacityMaterials.set(mesh, copies);
    }
    const materials = Array.isArray(source) ? source : [source];
    copies.forEach((copy, index) => {
      copy.opacity = (materials[index].opacity ?? 1) * opacity;
      copy.transparent = opacity < 1 || materials[index].transparent;
      copy.depthWrite = opacity > 0.98 ? materials[index].depthWrite : false;
    });
    mesh.material = Array.isArray(source) ? copies : copies[0];
  }
}
function clearHighlight() { if (selectedRecord) setHighlight(selectedRecord, false); }
function focusRecord(record) {
  const bounds = record.bounds;
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.62, 0.15);
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  const distance = THREE.MathUtils.clamp(radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)), controls.minDistance, controls.maxDistance);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction.lengthSq() ? direction : new THREE.Vector3(0, 0, 1), distance);
  controls.update();
}
function applyIsolation() {
  for (const system of systems.values()) {
    for (const record of system.structures) {
      record.root.visible = isRecordVisible(record);
      for (const mesh of record.meshes) {
        const materials = record.initialMaterials.get(mesh);
        const list = Array.isArray(materials) ? materials : [materials];
        const fade = Boolean(isolatedKey) && record.key !== isolatedKey;
        if (fade) {
          const faded = list.map((material) => {
            const copy = material.clone(); copy.transparent = true; copy.opacity = Math.min(material.opacity ?? 1, 0.12); copy.depthWrite = false; return copy;
          });
          const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          current.forEach((material) => { if (material !== materials) material?.dispose?.(); });
          mesh.material = Array.isArray(materials) ? faded : faded[0];
        } else if (mesh.material !== materials) {
          const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          current.forEach((material) => material?.dispose?.());
          mesh.material = materials;
        }
      }
    }
  }
  $('#isolate-state').hidden = !isolatedKey;
  $('#isolate').textContent = isolatedKey ? '◉  Exit isolation' : '◉  Isolate structure';
}
function setIsolation(key) {
  isolatedKey = isolatedKey ? null : key;
  applyIsolation();
}
function updateAnnotation() {
  const record = hoveredRecord || selectedRecord;
  if (!labelsEnabled || !record || !isAnatomyVisible(record.root) || anatomyLabelNodes.has(record.name)) { annotation.hidden = true; return; }
  const bounds = record.bounds;
  if (bounds.isEmpty()) { annotation.hidden = true; return; }
  const point = bounds.getCenter(annotationProjectionPoint).project(camera);
  if (point.z < -1 || point.z > 1) { annotation.hidden = true; return; }
  const x = (point.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-point.y * 0.5 + 0.5) * window.innerHeight;
  annotation.textContent = record.displayName;
  annotation.style.left = `${x + 12}px`;
  annotation.style.top = `${y - 12}px`;
  annotation.hidden = false;
}
function buildAnatomyLabels() {
  const container = $('#anatomy-labels');
  const leaderSvg = container.querySelector('.label-leaders');
  container.replaceChildren(leaderSvg);
  leaderSvg.replaceChildren();
  anatomyLabelNodes.clear();
  anatomyLeaderLines.clear();
  anatomyLabelMeshes.length = 0;
  for (const [key, definition] of Object.entries(anatomyLabelDefinitions)) {
    const record = structures.get(key);
    if (!record) continue;
    const label = document.createElement('button');
    label.className = 'anatomy-label';
    label.type = 'button';
    label.dataset.align = definition.align;
    label.textContent = definition.text;
    label.setAttribute('aria-label', `Select ${record.displayName}`);
    label.addEventListener('click', () => selectStructure(structures.get(key), { focus: false }));
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.dataset.structure = key;
    leaderSvg.append(line);
    container.append(label);
    anatomyLabelNodes.set(key, label);
    anatomyLeaderLines.set(key, line);
    anatomyLabelMeshes.push(...record.meshes);
  }
  updateAnatomyLabels();
}
function updateAnatomyLabels() {
  const container = $('#anatomy-labels');
  container.hidden = !labelsEnabled;
  const hoveredLabelRecord = hoveredRecord && anatomyLabelNodes.has(hoveredRecord.name) ? hoveredRecord : null;
  const selectedLabelRecord = selectedRecord && anatomyLabelNodes.has(selectedRecord.name) ? selectedRecord : null;
  const activeRecord = hoveredLabelRecord || selectedLabelRecord;
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const [key, label] of anatomyLabelNodes) {
    const line = anatomyLeaderLines.get(key);
    const record = structures.get(key);
    if (!labelsEnabled || !record || record !== activeRecord || !isAnatomyVisible(record.root)) {
      label.hidden = true;
      line.style.display = 'none';
      continue;
    }
    const point = record.bounds.getCenter(anatomyLabelProjectionPoint).project(camera);
    const x = (point.x * 0.5 + 0.5) * width;
    const y = (-point.y * 0.5 + 0.5) * height;
    if (point.z < -1 || point.z > 1 || x < 0 || x > width || y < 64 || y > height - 45) {
      label.hidden = true;
      line.style.display = 'none';
      continue;
    }
    const definition = anatomyLabelDefinitions[key];
    const labelX = THREE.MathUtils.clamp(x + definition.x, 8, width - 8);
    const labelY = THREE.MathUtils.clamp(y + definition.y, 72, height - 72);
    label.dataset.align = definition.align;
    label.style.left = `${labelX}px`;
    label.style.top = `${labelY}px`;
    label.hidden = false;
    line.setAttribute('x1', `${x}`);
    line.setAttribute('y1', `${y}`);
    line.setAttribute('x2', `${labelX}`);
    line.setAttribute('y2', `${labelY}`);
    line.style.display = '';
  }
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2100);
}

function pickAt(event, targets = anatomyRoot.children) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(targets, true).find((hit) => isAnatomyVisible(hit.object) && hit.object.userData.structureKey);
}
let pointerDown = null;
canvas.addEventListener('pointerdown', (event) => { if (event.button === 0) pointerDown = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('pointermove', (event) => {
  if (pointerDown || !anatomyLabelMeshes.length) return;
  const hit = pickAt(event, anatomyLabelMeshes);
  const next = hit ? structures.get(hit.object.userData.structureKey) : null;
  if (next === hoveredRecord) return;
  hoveredRecord = next;
  updateAnnotation();
  updateAnatomyLabels();
});
canvas.addEventListener('pointerleave', () => {
  if (!hoveredRecord) return;
  hoveredRecord = null;
  updateAnnotation();
  updateAnatomyLabels();
});
canvas.addEventListener('pointercancel', () => { pointerDown = null; });
canvas.addEventListener('pointerup', (event) => {
  if (!pointerDown) return;
  const wasClick = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 4;
  pointerDown = null;
  if (!wasClick) return;
  const hit = pickAt(event);
  if (measureMode) { if (hit) addMeasurePoint(hit.point); return; }
  if (hit) {
    const record = structures.get(hit.object.userData.structureKey);
    if (record) selectStructure(record, { focus: false });
  }
});
$('#structure-search').addEventListener('input', buildStructureBrowser);
$('#structure-search').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const first = $('#structure-list .structure-item');
    if (first) first.click();
  }
});
$('#clear-selection').addEventListener('click', () => {
  clearHighlight();
  selectedRecord = null;
  updateStructureInfo(null);
  buildStructureBrowser();
  updateAnnotation();
  updateAnatomyLabels();
});
$('#reset-layers').addEventListener('click', () => {
  for (const system of systems.values()) { system.visible = true; for (const record of system.structures) record.visible = true; }
  for (const layer of layerDefinitions) if (layer.available !== false) layer.visible = true;
  if (isolatedKey) { isolatedKey = null; applyIsolation(); }
  applyVisibility(); buildSystemControls(); buildStructureBrowser();
  const pendingLayers = [muscleLayer, nerveLayer].filter((layer) => !layer.loaded && anatomyReady);
  if (pendingLayers.length) {
    for (const layer of pendingLayers) layer.loading = true;
    setLoadText(`Loading ${pendingLayers.map((layer) => layer.label.toLowerCase()).join(' and ')} layers…`);
    buildLayerControls();
    for (const layer of pendingLayers) loadLazyLayer(layer).catch(() => {});
  }
  $('#isolate-state').hidden = true; showToast('All available anatomy layers are visible');
});
$('#isolate').addEventListener('click', () => { if (!selectedRecord) return; setIsolation(selectedRecord.key); });
$('#show-all').addEventListener('click', () => { isolatedKey = null; applyIsolation(); });
$('#opacity-slider').addEventListener('input', (event) => {
  if (!selectedRecord) return;
  const record = selectedRecord;
  const opacity = Number(event.target.value) / 100;
  $('#opacity-value').textContent = `${event.target.value}%`;
  setHighlight(record, false);
  record.opacity = opacity;
  applyRecordOpacity(record);
  setHighlight(record, true);
});
$('#muscle-opacity-slider').addEventListener('input', (event) => {
  const opacity = Number(event.target.value) / 100;
  muscleLayer.opacity = opacity;
  $('#muscle-opacity-value').textContent = `${event.target.value}%`;
  for (const record of structures.values()) {
    if (!muscleStructureNames.has(record.name)) continue;
    const highlighted = record === selectedRecord;
    if (highlighted) setHighlight(record, false);
    applyRecordOpacity(record);
    if (highlighted) setHighlight(record, true);
  }
});

const viewDirections = {
  front: { direction: new THREE.Vector3(0.24, 0, 0.971).normalize(), up: new THREE.Vector3(0, 1, 0), label: 'ANTERIOR · 3/4' },
  back: { direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), label: 'POSTERIOR' },
  left: { direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: 'LEFT LATERAL' },
  right: { direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: 'RIGHT LATERAL' },
  top: { direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), label: 'SUPERIOR' },
  bottom: { direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1), label: 'INFERIOR' },
};
function setView(name) {
  if (name === 'full-body') {
    const scan = structures.get('Human skeleton');
    if (!scan || !fitCameraToSkeleton(scan.root, camera, controls, 'full')) return;
    cameraFraming = 'full';
    $('.model-name').textContent = 'FULL BODY · ANTERIOR';
    document.querySelectorAll('.view-button').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
    return;
  }
  const view = viewDirections[name]; if (!view) return;
  const distance = camera.position.distanceTo(controls.target);
  camera.up.copy(view.up);
  camera.position.copy(controls.target).addScaledVector(view.direction, distance);
  controls.update();
  $('.model-name').textContent = `${cameraFraming === 'full' ? 'FULL BODY' : 'TORSO'} · ${view.label}`;
  document.querySelectorAll('.view-button').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
}
document.querySelectorAll('.view-button').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$('#reset-camera').addEventListener('click', () => {
  const scan = structures.get('Human skeleton');
  if (scan) {
    cameraFraming = 'torso';
    fitCameraToSkeleton(scan.root, camera, controls, cameraFraming);
  }
  setView('front');
});
$('#labels').addEventListener('click', () => {
  labelsEnabled = !labelsEnabled; $('#labels').classList.toggle('selected', labelsEnabled); updateAnnotation(); updateAnatomyLabels();
});
function setInterfaceHidden(hidden) {
  document.body.classList.toggle('interface-hidden', hidden);
  const button = $('#interface-toggle');
  button.textContent = hidden ? 'Show interface' : 'Hide interface';
  button.setAttribute('aria-pressed', String(hidden));
  button.title = hidden ? 'Show the viewer controls' : 'Hide the viewer controls';
}
$('#interface-toggle').addEventListener('click', () => {
  setInterfaceHidden(!document.body.classList.contains('interface-hidden'));
});
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target.isContentEditable) return;
  if (event.key === '/') { event.preventDefault(); $('#structure-search').focus(); }
  if (event.key.toLowerCase() === 'r') $('#reset-camera').click();
  if (event.key.toLowerCase() === 'h') setInterfaceHidden(!document.body.classList.contains('interface-hidden'));
  if (event.key === 'Escape' && document.body.classList.contains('interface-hidden')) setInterfaceHidden(false);
  if (event.key === '1') setView('front');
  if (event.key === '2') setView('back');
  if (event.key === '3') setView('left');
  if (event.key === '4') setView('right');
  if (event.key === '5') setView('full-body');
});

function addMeasurePoint(point) {
  measurePoints.push(point.clone());
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), new THREE.MeshBasicMaterial({ color: 0x55e0bd }));
  marker.position.copy(point); scene.add(marker); measureObjects.push(marker);
  if (measurePoints.length === 2) {
    const [a, b] = measurePoints;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x55e0bd }));
    scene.add(line); measureObjects.push(line);
    const cm = a.distanceTo(b) * 100;
    $('#measure-hint').firstChild.textContent = `Measured distance: ${cm.toFixed(1)} cm `;
    $('#measure').classList.add('selected'); measureMode = false;
    setTimeout(() => $('#measure-hint').hidden = true, 3000);
  }
}
function clearMeasure() {
  measureMode = false; measurePoints = [];
  for (const object of measureObjects) { scene.remove(object); object.geometry?.dispose?.(); object.material?.dispose?.(); }
  measureObjects = []; $('#measure-hint').hidden = true; $('#measure').classList.remove('selected');
}
$('#measure').addEventListener('click', () => {
  clearMeasure(); measureMode = true; $('#measure-hint').hidden = false;
  $('#measure-hint').firstChild.textContent = 'Click two points on the model to measure ';
  $('#measure').classList.add('selected');
});
$('#cancel-measure').addEventListener('click', clearMeasure);

function saveScreenshot() {
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) { showToast('Screenshot could not be created'); return; }
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'mediview-anatomy.png'; link.click(); URL.revokeObjectURL(link.href);
    showToast('Screenshot saved');
  }, 'image/png');
}
$('#screenshot').addEventListener('click', saveScreenshot);
function saveView() {
  const state = {
    camera: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray(),
    systems: Object.fromEntries([...systems].map(([id, system]) => [id, system.visible])),
    layers: Object.fromEntries(layerDefinitions.filter((layer) => layer.available !== false).map((layer) => [layer.id, layer.visible])),
    structures: Object.fromEntries([...structures].map(([key, record]) => [key, record.visible])),
  };
  localStorage.setItem('mediview-anatomy-view', JSON.stringify(state));
  $('#restore-view').disabled = false;
  showToast('View saved on this device');
}
$('#save-view').addEventListener('click', saveView);
function restoreView() {
  try {
    const state = JSON.parse(localStorage.getItem('mediview-anatomy-view') || 'null');
    if (!state) return;
    camera.position.fromArray(state.camera); controls.target.fromArray(state.target); camera.up.fromArray(state.up);
    for (const [id, visible] of Object.entries(state.systems || {})) if (systems.has(id)) systems.get(id).visible = visible;
    for (const [id, visible] of Object.entries(state.layers || {})) {
      const layer = layerDefinitions.find((item) => item.id === id && item.available !== false);
      if (layer) layer.visible = visible;
    }
    for (const [key, visible] of Object.entries(state.structures || {})) if (structures.has(key)) structures.get(key).visible = visible;
    controls.update(); buildSystemControls(); applyVisibility(); buildStructureBrowser();
    const pendingLayers = [muscleLayer, nerveLayer].filter((layer) => layer.visible && !layer.loaded && anatomyReady);
    if (pendingLayers.length) {
      for (const layer of pendingLayers) layer.loading = true;
      setLoadText(`Loading the saved ${pendingLayers.map((layer) => layer.label.toLowerCase()).join(' and ')} layers…`);
      buildLayerControls();
      for (const layer of pendingLayers) loadLazyLayer(layer).catch(() => {});
    }
    showToast('Saved view restored');
  } catch { showToast('Saved view could not be restored'); }
}
$('#restore-view').addEventListener('click', restoreView);

const guidedKeys = [
  'Heart', 'Lung_L', 'Trachea', 'Liver', 'Stomach', 'Pancreas',
  'Small_Intestine', 'Large_Intestine', 'Spleen', 'Kidney_L', 'Bladder',
  ...muscleStructureNames,
  ...nerveStructureNames,
  'VenaCava_Central', 'Human skeleton',
];
const tourCard = $('#tour-card');
function showTourStop() {
  const key = guidedKeys[tourIndex]; const record = structures.get(key);
  const layer = [muscleLayer, nerveLayer].find((candidate) => candidate.matches({ name: key }));
  if (!record && layer && anatomyReady) {
    layer.visible = true;
    layer.loading = true;
    buildLayerControls();
    $('#tour-title').textContent = `${layer.label} layer`;
    $('#tour-progress').textContent = 'Loading structures for the guided tour…';
    tourCard.hidden = false;
    loadLazyLayer(layer).then(showTourStop).catch(() => {});
    return;
  }
  if (!record) { if (tourIndex < guidedKeys.length - 1) { tourIndex++; showTourStop(); } else finishTour(); return; }
  selectStructure(record);
  $('#tour-title').textContent = record.displayName;
  $('#tour-progress').textContent = `Structure ${tourIndex + 1} of ${guidedKeys.length} · ${record.system.label}`;
  tourCard.hidden = false;
  $('#tour-next').textContent = tourIndex === guidedKeys.length - 1 ? 'Finish' : 'Next →';
}
function finishTour() { tourCard.hidden = true; tourIndex = -1; clearHighlight(); showToast('Guided exploration complete'); }
$('#guided-tour').addEventListener('click', () => { tourIndex = 0; showTourStop(); });
$('#tour-next').addEventListener('click', () => { if (tourIndex >= guidedKeys.length - 1) finishTour(); else { tourIndex++; showTourStop(); } });
$('#tour-close').addEventListener('click', finishTour);

$('#structure-search').addEventListener('focus', () => { activeCategoryFilter = null; buildStructureBrowser(); });
let savedCategoryFilter = null;
$('#system-list').addEventListener('dblclick', (event) => {
  const button = event.target.closest('[data-system]'); if (!button) return;
  savedCategoryFilter = savedCategoryFilter === button.dataset.system ? null : button.dataset.system;
  activeCategoryFilter = savedCategoryFilter; buildStructureBrowser();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
controls.addEventListener('change', updateAnnotation);

setLoadText('Loading high detail scan mesh…');
loadSkeleton().then(() => loadNamedAnatomy()).then((registration) => {
  setLoadText(`${structures.size} structures · landmark fit RMS ${Math.round(registration.rmsError * 1000)} mm · Artec scan CC BY 3.0`);
  updateStructureCount(); buildSystemControls(); buildStructureBrowser();
  buildAnatomyLabels();
  $('#restore-view').disabled = !localStorage.getItem('mediview-anatomy-view');
}).catch((error) => {
  console.error('Anatomy model load failed', error);
  setLoadText(`Some anatomy assets could not be loaded: ${error.message || 'check your connection and refresh.'}`, true);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  updateAnnotation();
  updateAnatomyLabels();
}
animate();
