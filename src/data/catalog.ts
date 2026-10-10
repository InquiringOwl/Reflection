// Initial local catalog. Every numerical record below was checked against the cited page on
// 2026-10-10. Hz values marked by:'app' are calculated by Reflection with the shown equation and
// rounded to the significant figures of the source value. Nothing is filled in where no
// source value was verified: those categories show an honest empty state.
import type { Category, DataRecord, Entity, Process, Source } from './schema';

const RETRIEVED = '2026-10-10';

export const SOURCES: Source[] = [
  { id: 'nssdca-fact', title: 'Planetary Fact Sheet — Metric', provider: 'NASA NSSDCA (D. R. Williams), NASA Goddard Space Flight Center', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/', published: '2025-03-18 (last updated)', retrieved: RETRIEVED, license: 'U.S. Government work (NASA); check NASA media/data usage guidelines', notes: 'Values are rounded summary figures; see the per-planet fact sheets for more digits. Negative rotation period indicates retrograde rotation.' },
  { id: 'iso16', title: 'ISO 16:1975 — Acoustics — Standard tuning frequency (Standard musical pitch)', provider: 'International Organization for Standardization', url: 'https://www.iso.org/standard/3601.html', published: '1975-01 (confirmed 2022)', retrieved: RETRIEVED, license: 'Standard text is copyrighted; only the abstract statement is used here.' },
  { id: 'sshade-quartz', title: 'Normalized Raman spectrum of SiO₂ quartz acquired with a 514 nm laser', provider: 'SSHADE (G. Montagnac); experiment "Raman spectra of some SiO2 polymorphs"', url: 'https://sshade.eu/data/SPECTRUM_GM_20220331_001/details', doi: '10.26302/SSHADE/EXPERIMENT_GM_20220331', retrieved: RETRIEVED, license: 'Not stated on the page — verify before redistributing spectral data.', notes: 'Only the reference band position is used; the spectrum itself has not been ingested.' },
  { id: 'nigms-circ', title: 'Circadian Rhythms', provider: 'NIH National Institute of General Medical Sciences', url: 'https://nigms.nih.gov/education/Pages/Circadian-Rhythms', retrieved: RETRIEVED, specRef: 23, license: 'U.S. Government work' },
  { id: 'mayo-hr', title: "Heart rate: What's normal?", provider: 'Mayo Clinic', url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/expert-answers/heart-rate/faq-20057979', retrieved: RETRIEVED, license: 'Copyrighted web page; value cited, text not reproduced.' },
  { id: 'ndbc-spectra', title: 'Description of NDBC wave spectra', provider: 'NOAA National Data Buoy Center', url: 'https://www.ndbc.noaa.gov/faq/wavespectra.shtml', retrieved: RETRIEVED, license: 'U.S. Government work', notes: 'Analysis-band configuration of a data product, not a property of ocean waves.' },
  { id: 'hyperphysics-h21', title: 'The Hydrogen 21-cm Line', provider: 'HyperPhysics, Georgia State University (C. R. Nave)', url: 'https://hyperphysics.gsu.edu/hbase/quantum/h21.html', retrieved: RETRIEVED, license: 'Educational web page; value cited.', notes: 'Source gives the value to 4 significant figures ("1420 MHz"). Higher-precision laboratory values exist in the literature but were not verified for this catalog.' },
  // Specification source register (starting points; not yet ingested)
  { id: 'openstax-shm', title: 'Simple Harmonic Motion (University Physics Vol. 1, §15.1)', provider: 'OpenStax', url: 'https://openstax.org/books/university-physics-volume-1/pages/15-1-simple-harmonic-motion', specRef: 1 },
  { id: 'openstax-waves', title: 'Mathematics of Waves (University Physics Vol. 1, §16.2)', provider: 'OpenStax', url: 'https://openstax.org/books/university-physics-volume-1/pages/16-2-mathematics-of-waves', specRef: 2 },
  { id: 'openstax-superpos', title: 'Superposition and Interference (College Physics 2e §16.10)', provider: 'OpenStax', url: 'https://openstax.org/books/college-physics-2e/pages/16-10-superposition-and-interference', specRef: 2 },
  { id: 'unsw-osc', title: 'Oscillations', provider: 'UNSW Physics (J. Wolfe)', url: 'https://www.animations.physics.unsw.edu.au/jw/oscillations.htm', specRef: 3 },
  { id: 'mit-803', title: '8.03SC Vibrations and Waves — Ch. 2 Forced Oscillation and Resonance', provider: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/782069da3820fc514c10c26ae0c15b01_MIT8_03SCF16_Text_Ch2.pdf', specRef: 3 },
  { id: 'dspguide-8', title: 'The Discrete Fourier Transform (DSP Guide ch. 8)', provider: 'Steven W. Smith', url: 'https://www.dspguide.com/ch8.htm', specRef: 4 },
  { id: 'dspguide-sampling', title: 'The Sampling Theorem (DSP Guide ch. 3.2)', provider: 'Steven W. Smith', url: 'https://dspguide.com/ch3/2.htm', specRef: 4 },
  { id: 'dspguide-quant', title: 'Quantization (DSP Guide ch. 3.1)', provider: 'Steven W. Smith', url: 'https://www.dspguide.com/ch3/1.htm', specRef: 4 },
  { id: 'dspguide-fs', title: 'Fourier Series (DSP Guide ch. 13.4)', provider: 'Steven W. Smith', url: 'https://dspguide.com/ch13/4.htm', specRef: 4 },
  { id: 'horizons', title: 'JPL Horizons System', provider: 'NASA JPL Solar System Dynamics', url: 'https://ssd.jpl.nasa.gov/horizons/', specRef: 5, notes: 'Adapter planned for Milestone 2.' },
  { id: 'rruff', title: 'RRUFF Project database', provider: 'RRUFF', url: 'https://www.rruff.net/', specRef: 6, notes: 'Curated import planned for Milestone 2.' },
  { id: 'nist-asd', title: 'NIST Atomic Spectra Database', provider: 'NIST', url: 'https://www.nist.gov/pml/atomic-spectra-database', specRef: 7 },
  { id: 'nist-mol', title: 'NIST Molecular Spectral Databases', provider: 'NIST', url: 'https://www.nist.gov/pml/molecular-microwave-spectral-databases', specRef: 7 },
  { id: 'sdbs', title: 'Spectral Database for Organic Compounds (SDBS)', provider: 'AIST Japan', url: 'https://sdbs.db.aist.go.jp/Htmls/Introduction_eng.html', specRef: 8 },
  { id: 'hmdb', title: 'Human Metabolome Database — NMR search & downloads', provider: 'HMDB', url: 'https://hmdb.ca/downloads', specRef: 9 },
  { id: 'ninds', title: 'Neurological Diagnostic Tests and Procedures', provider: 'NIH NINDS', url: 'https://www.ninds.nih.gov/health-information/disorders/neurological-diagnostic-tests-and-procedures', specRef: 10 },
  { id: 'emotion-decoding', title: 'EEG feature/classification study (emotion)', provider: 'Scientific Reports', url: 'https://www.nature.com/articles/s41598-021-86345-5', specRef: 11 },
  { id: 'noaa-waves', title: 'NDBC wave measurement / NOAA JetStream waves', provider: 'NOAA', url: 'https://www.ndbc.noaa.gov/wavemeas.pdf', specRef: 12 },
  { id: 'mathworks-tf', title: 'Time-Frequency Analysis', provider: 'MathWorks', url: 'https://www.mathworks.com/help/signal/time-frequency-analysis.html', specRef: 13 },
  { id: 'mathworks-wavelet', title: 'Continuous Wavelet Transforms / Wavelet Coherence', provider: 'MathWorks', url: 'https://www.mathworks.com/help/wavelet/continuous-wavelet-transforms.html', specRef: 14 },
  { id: 'nasa-sonif', title: 'Webb Sonifications', provider: 'NASA', url: 'https://science.nasa.gov/mission/webb/sonifications/', specRef: 16 },
  { id: 'adi-dds', title: 'All About Direct Digital Synthesis', provider: 'Analog Devices', url: 'https://www.analog.com/en/resources/analog-dialogue/articles/all-about-direct-digital-synthesis.html', specRef: 17 },
  { id: 'mit-modulation', title: '6.02 Modulation (ch. 14)', provider: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/6-02-introduction-to-eecs-ii-digital-communication-systems-fall-2012/2ab9b67e8fccafa520dac8033003b289_MIT6_02F12_chap14.pdf', specRef: 17 },
  { id: 'mdn-worklet', title: 'Using AudioWorklet', provider: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet', specRef: 18 },
  { id: 'plant-calcium', title: 'Guard cell calcium oscillations encode stomatal movements', provider: 'Nature', url: 'https://www.nature.com/articles/35082575', specRef: 20 },
  { id: 'pollen-spiking', title: 'Pollen tube spiking (Nature 2024)', provider: 'Nature', url: 'https://www.nature.com/articles/s41586-024-07445-6', specRef: 20 },
  { id: 'nist-jnt', title: 'Johnson Noise Thermometry', provider: 'NIST', url: 'https://www.nist.gov/programs-projects/johnson-noise-thermometry', specRef: 21 },
  { id: 'mre', title: 'Magnetic resonance elastography', provider: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/11731304/', specRef: 22 },
  { id: 'ncbi-enzyme', title: 'Protein Function (enzyme turnover)', provider: 'NCBI Bookshelf', url: 'https://www.ncbi.nlm.nih.gov/books/NBK26911/', specRef: 24 },
  { id: 'unsw-spectra', title: 'Sound spectra', provider: 'UNSW Music Acoustics', url: 'https://newt.phys.unsw.edu.au/jw/sound.spectrum.html', specRef: 25 },
  { id: 'nasa-astrobio', title: 'NASA Astrobiology research', provider: 'NASA', url: 'https://astrobiology.nasa.gov/research/', specRef: 26 },
  { id: 'nasa-ladder', title: 'Ladder of Life Detection', provider: 'NASA', url: 'https://astrobiology.nasa.gov/research/life-detection/ladder/', specRef: 27 },
  { id: 'nasa-falsepos', title: 'Life or illusion? Avoiding false positives', provider: 'NASA', url: 'https://science.nasa.gov/universe/exoplanets/life-or-illusion-avoiding-false-positives-in-the-search-for-living-worlds/', specRef: 28 },
  { id: 'exo-archive', title: 'NASA Exoplanet Archive', provider: 'NASA / IPAC', url: 'https://exoplanetarchive.ipac.caltech.edu/', specRef: 29 },
  { id: 'mast', title: 'Mikulski Archive for Space Telescopes', provider: 'STScI', url: 'https://archive.stsci.edu/', specRef: 30 },
  { id: 'hitran', title: 'HITRAN molecular spectroscopic database', provider: 'Harvard-Smithsonian CfA', url: 'https://www.hitran.org/', specRef: 31 },
  { id: 'psg', title: 'Planetary Spectrum Generator', provider: 'NASA GSFC', url: 'https://psg.gsfc.nasa.gov/about.php', specRef: 32 },
];

export const CATEGORIES: Category[] = [
  { id: 'astro', group: 'Cosmos', label: 'Planetary bodies & astronomical objects', supports: 'Orbital periods, rotation, relative orbital cycles, documented resonances, other separately sourced oscillations', context: 'Body identifier, centre, frame, epoch, time scale, calculation interval', sourceOptions: ['horizons', 'nssdca-fact'], milestone: 'M1 records · M2 Horizons adapter' },
  { id: 'ecliptic', group: 'Cosmos', label: 'Planetary positions along the ecliptic', supports: 'Longitude, latitude, angular motion, pairwise separation, alignments, recurrence intervals', context: 'Geocentric/heliocentric/topocentric, reference plane, equinox, observer, date/time (UTC ≠ TT ≠ TDB)', sourceOptions: ['horizons'], milestone: 'M2' },
  { id: 'astrobio', group: 'Cosmos', label: 'Astrobiology', supports: 'Habitability variables, candidate biosignatures, atmospheric/surface spectra, stellar variability, analog environments', context: 'Separate habitability, candidate detection, biological attribution and confirmation; no automatic life verdict', sourceOptions: ['nasa-astrobio', 'nasa-ladder', 'nasa-falsepos', 'exo-archive', 'mast', 'hitran', 'psg'], milestone: 'Schema M1 · explorer M2 · retrieval M3' },
  { id: 'geo-min', group: 'Matter', label: 'Geological minerals', supports: 'Raman/IR spectra, crystal information, other measured modes', context: 'Species, composition, crystal phase, specimen, temperature, method', sourceOptions: ['rruff', 'sshade-quartz'], milestone: 'M1 record · M2 RRUFF import' },
  { id: 'nutri-min', group: 'Matter', label: 'Nutritional minerals', supports: 'Element/ion/compound-specific spectra and processes', context: 'Atom vs charge state vs salt vs solution vs biological setting', sourceOptions: ['nist-asd', 'nist-mol'], milestone: 'M2' },
  { id: 'vitamins', group: 'Matter', label: 'Vitamins', supports: 'Molecular spectra; documented biological rhythms involving them', context: 'Exact molecular form, identifiers, solvent, concentration, method', sourceOptions: ['sdbs', 'hmdb'], milestone: 'M2' },
  { id: 'thermo', group: 'Matter', label: 'Thermodynamics', supports: 'Thermal noise, radiation spectra, molecular modes', context: 'Temperature, material, bandwidth, model assumptions', sourceOptions: ['nist-jnt'], milestone: 'M3 models' },
  { id: 'hydro', group: 'Matter', label: 'Hydrodynamics', supports: 'Surface waves, pressure fluctuations, pulsatile flow, fluid resonances', context: 'Depth, boundaries, density/viscosity, gravity, flow conditions', sourceOptions: ['ndbc-spectra', 'noaa-waves'], milestone: 'M1 record · M3 dispersion model' },
  { id: 'muscles', group: 'Life', label: 'Muscles', supports: 'Electrical signals, contraction rhythms, mechanical vibrations', context: 'Muscle, activity, sensor, placement, loading', sourceOptions: [], milestone: 'M2' },
  { id: 'vessels', group: 'Life', label: 'Blood vessels', supports: 'Pressure, flow, wall-motion time series', context: 'Vessel, location, physiological condition, sensor', sourceOptions: [], milestone: 'M2' },
  { id: 'neurons', group: 'Life', label: 'Neurons', supports: 'Event timing, firing rates, rhythmic activity, population signals', context: 'Spike rate ≠ oscillatory frequency; method and brain location', sourceOptions: ['ninds'], milestone: 'M2' },
  { id: 'bones', group: 'Life', label: 'Bones', supports: 'Mechanical modes, acoustic response', context: 'Specimen geometry, boundary conditions, material state', sourceOptions: ['mre'], milestone: 'M2' },
  { id: 'organs', group: 'Life', label: 'Organs & glands', supports: 'Electrical/mechanical rhythms, secretion and daily cycles', context: 'Named process, organ, conditions, measurement duration', sourceOptions: ['mayo-hr', 'nigms-circ'], milestone: 'M1 records' },
  { id: 'cells', group: 'Life', label: 'Cells', supports: 'Calcium oscillations, membrane activity, biochemical cycles', context: 'Species, cell type, compartment, stimulus', sourceOptions: ['plant-calcium', 'pollen-spiking'], milestone: 'M2' },
  { id: 'proteins', group: 'Life', label: 'Proteins', supports: 'Molecular spectra, conformational processes', context: 'Exact protein/structure/state, method', sourceOptions: ['hmdb'], milestone: 'M2' },
  { id: 'enzymes', group: 'Life', label: 'Enzymes', supports: 'Spectra, documented oscillatory dynamics; catalytic rates kept separately', context: 'Substrate, temperature, pH, kinetics — turnover is not automatically Hz', sourceOptions: ['ncbi-enzyme'], milestone: 'M2' },
  { id: 'hormones', group: 'Life', label: 'Hormones', supports: 'Molecular spectra; pulsatile/circadian concentration patterns', context: 'Compound identity vs secretion rhythm', sourceOptions: ['hmdb', 'nigms-circ'], milestone: 'M2' },
  { id: 'plants', group: 'Life', label: 'Plants & herbs', supports: 'Cellular rhythms, daily rhythms, mechanical signals, constituent spectra', context: 'Species, part, growth conditions, preparation, constituent identity', sourceOptions: ['plant-calcium', 'pollen-spiking', 'nigms-circ'], milestone: 'M2' },
  { id: 'emotion', group: 'Mind', label: 'Emotional states', supports: 'Frequency features associated with assessed valence, arousal, or defined states', context: 'EEG/MEG/intracranial method, channel, task, population, model validation — no single-Hz label per emotion', sourceOptions: ['emotion-decoding', 'ninds'], milestone: 'M2' },
  { id: 'temperament', group: 'Mind', label: 'Temperament traits', supports: 'Study-specific associations with assessed longer-term traits', context: 'Traits are distinct from transient emotional states', sourceOptions: [], milestone: 'M2' },
  { id: 'music', group: 'Sound & signal', label: 'Music theory', supports: 'Fundamentals, harmonics, overtones, intervals, tuning, beats, timbre', context: 'Reference pitch and tuning system', sourceOptions: ['iso16', 'unsw-spectra'], milestone: 'M1 records' },
  { id: 'electronics', group: 'Sound & signal', label: 'Electronic-device analytics', supports: 'Clocks, carriers, pulses, modulation, sampling, switching, noise', context: 'Device/signal identity, sample rate, bit/symbol timing, acquisition bandwidth', sourceOptions: ['adi-dds', 'mit-modulation'], milestone: 'M2' },
  { id: 'medicines', group: 'Pharmacology', label: 'Medicines', supports: 'Spectra of active ingredients and characterised preparations', context: 'Compound vs formulation vs mixture; product ≠ ingredient', sourceOptions: ['sdbs', 'hmdb'], milestone: 'M2' },
  { id: 'pharma', group: 'Pharmacology', label: 'Pharmacology', supports: 'Concentration time courses; documented effects on oscillatory systems', context: 'Exposure, timing, assay, system — effects are not a drug\'s intrinsic frequency', sourceOptions: [], milestone: 'M2' },
];

export const ENTITIES: Entity[] = [];
export const PROCESSES: Process[] = [];
export const RECORDS: DataRecord[] = [];

function sig(x: number, n: number) { return +x.toPrecision(n); }
function sigFigsOf(text: string) {
  const digits = text.replace(/[^0-9.]/g, '').replace('.', '').replace(/^0+/, '');
  return Math.max(1, digits.length);
}

// ---- Planetary bodies (NASA NSSDCA fact sheet) -------------------------------------------
const PLANETS: [string, string, string, string][] = [
  // name, rotation period (h), orbital period (d), Horizons id
  ['Mercury', '1407.6', '88.0', '199'],
  ['Venus', '-5832.5', '224.7', '299'],
  ['Earth', '23.9', '365.2', '399'],
  ['Moon', '655.7', '27.3', '301'],
  ['Mars', '24.6', '687.0', '499'],
  ['Jupiter', '9.9', '4331', '599'],
  ['Saturn', '10.7', '10747', '699'],
  ['Uranus', '-17.2', '30589', '799'],
  ['Neptune', '16.1', '59800', '899'],
];
for (const [name, rot, orb, hid] of PLANETS) {
  const eid = `body-${name.toLowerCase()}`;
  ENTITIES.push({ id: eid, name, categories: ['astro'], identifiers: { 'JPL Horizons ID': hid }, description: name === 'Moon' ? "Earth's natural satellite." : `Planet of the Solar System.` });
  const rotH = parseFloat(rot), orbD = parseFloat(orb);
  const sfR = sigFigsOf(rot), sfO = sigFigsOf(orb);
  PROCESSES.push({ id: `${eid}-orbit`, entityId: eid, phenomenon: name === 'Moon' ? 'Orbit around Earth' : 'Orbit around the Sun', quantity: 'orbital period', processType: 'orbital' });
  PROCESSES.push({ id: `${eid}-rot`, entityId: eid, phenomenon: 'Sidereal rotation', quantity: 'rotation period', processType: 'rotational' });
  RECORDS.push({
    id: `r-${eid}-orbit`, entityId: eid, processId: `${eid}-orbit`, categories: ['astro'], evidence: 'source-calculated', role: 'source frequency',
    hz: { value: sig(1 / (orbD * 86400), sfO), by: 'app', equation: 'f = 1 / (T_days × 86 400 s)', sigFigs: sfO },
    original: { value: orbD, unit: 'days', text: `${orb} days` },
    uncertainty: `Rounded summary value (${sfO} significant figures) as published; no uncertainty stated.`,
    method: 'Compiled orbital period from NASA fact sheet', conditions: { reference: name === 'Moon' ? 'orbit about Earth (see fact sheet notes)' : 'heliocentric orbit', 'time unit': 'day = 86 400 s' },
    sourceIds: ['nssdca-fact'], hasTimeSeries: false, hasSpectrum: false,
    notes: ['An orbital frequency describes the repetition of a position, not an emitted sound or vibration.', 'Matching Hz with any other record does not imply interaction (spec §2.5).'],
  });
  RECORDS.push({
    id: `r-${eid}-rot`, entityId: eid, processId: `${eid}-rot`, categories: ['astro'], evidence: 'source-calculated', role: 'source frequency',
    hz: { value: sig(1 / (Math.abs(rotH) * 3600), sfR), by: 'app', equation: 'f = 1 / (|T_hours| × 3600 s)', sigFigs: sfR, note: rotH < 0 ? 'Source period is negative to mark retrograde rotation; frequency magnitude shown. Retrograde is a direction, not a negative frequency.' : undefined },
    original: { value: rotH, unit: 'hours', text: `${rot} hours` },
    uncertainty: `Rounded summary value (${sfR} significant figures) as published; no uncertainty stated.`,
    method: 'Compiled sidereal rotation period from NASA fact sheet', conditions: { reference: 'sidereal (relative to fixed stars)', sense: rotH < 0 ? 'retrograde' : 'prograde' },
    sourceIds: ['nssdca-fact'], hasTimeSeries: false, hasSpectrum: false,
  });
}

// ---- Hydrogen 21-cm line ----------------------------------------------------------------
ENTITIES.push({ id: 'h-i', name: 'Neutral atomic hydrogen (H I)', aliases: ['hydrogen line', '21-cm line'], categories: ['astro'], description: 'Neutral hydrogen atoms, abundant in interstellar gas.' });
PROCESSES.push({ id: 'h-i-hyperfine', entityId: 'h-i', phenomenon: 'Ground-state hyperfine (spin-flip) transition', quantity: 'transition frequency', processType: 'atomic transition' });
RECORDS.push({
  id: 'r-h-i-21cm', entityId: 'h-i', processId: 'h-i-hyperfine', categories: ['astro'], evidence: 'measured', role: 'source frequency',
  hz: { value: 1.420e9, by: 'source', sigFigs: 4 },
  original: { value: 1420, unit: 'MHz', text: '1420 MHz (≈ 21 cm wavelength)' },
  uncertainty: 'Stated to 4 significant figures by the cited page.',
  method: 'Value as stated by educational reference', conditions: { medium: 'atomic hydrogen, ground state' },
  sourceIds: ['hyperphysics-h21'], hasTimeSeries: false, hasSpectrum: false,
  notes: ['This is an electromagnetic transition frequency (radio), far above audio range. Any audible version is a mapped sonification.'],
});

// ---- Quartz Raman band (SSHADE) ----------------------------------------------------------
ENTITIES.push({ id: 'min-quartz', name: 'Quartz (α-SiO₂)', aliases: ['alpha quartz', 'SiO2'], categories: ['geo-min'], identifiers: { formula: 'SiO₂' }, description: 'Trigonal low-temperature polymorph of silica.' });
PROCESSES.push({ id: 'quartz-raman-main', entityId: 'min-quartz', phenomenon: 'Main Raman band (lattice vibrational mode)', quantity: 'Raman shift', processType: 'vibrational mode' });
RECORDS.push({
  id: 'r-quartz-raman-464', entityId: 'min-quartz', processId: 'quartz-raman-main', categories: ['geo-min'], evidence: 'measured', role: 'frequency difference',
  hz: { value: sig(29979245800 * 464.0, 4), by: 'app', equation: 'Δf = c · Δν̃,  c = 2.99792458×10¹⁰ cm/s', sigFigs: 4, note: 'Raman shift → frequency DIFFERENCE between incident and scattered light, not the optical carrier frequency.' },
  original: { value: 464.0, unit: 'cm⁻¹ (Raman shift)', text: '464.0 cm⁻¹ (main band reference position)' },
  uncertainty: 'Not stated; normalized spectrum (most intense peak = 1).',
  method: 'Micro-Raman spectroscopy, DILOR XY, 514.5 nm excitation, ×100 objective, single 1 µm spot',
  conditions: { specimen: 'quartz α (SiO₂)', medium: 'air', temperature: 'not stated', preprocessing: 'polynomial baseline correction; max-normalised' },
  sourceIds: ['sshade-quartz'], hasTimeSeries: false, hasSpectrum: false,
  notes: ['Spectrum available at source; not ingested in this build.'],
});

// ---- Music: standard pitch ---------------------------------------------------------------
ENTITIES.push({ id: 'pitch-a4', name: 'Standard musical pitch A4', aliases: ['concert A', 'A440'], categories: ['music'], description: 'The note A in the treble stave.' });
PROCESSES.push({ id: 'pitch-a4-def', entityId: 'pitch-a4', phenomenon: 'Tuning reference', quantity: 'fundamental frequency', processType: 'convention' });
RECORDS.push({
  id: 'r-a4-iso16', entityId: 'pitch-a4', processId: 'pitch-a4-def', categories: ['music'], evidence: 'defined-standard', role: 'source frequency',
  hz: { value: 440, by: 'source' }, original: { value: 440, unit: 'Hz', text: '440 Hz' },
  uncertainty: 'Tuning instruments to produce it within ±0.5 Hz (ISO 16 abstract).', method: 'International standard', conditions: { 'tuning system': 'reference pitch only (system-independent)' },
  sourceIds: ['iso16'], hasTimeSeries: false, hasSpectrum: false,
});
ENTITIES.push({ id: 'pitch-c4-12tet', name: 'Middle C (C4) in 12-TET', categories: ['music'], description: 'C4 calculated from A4 = 440 Hz in twelve-tone equal temperament.' });
PROCESSES.push({ id: 'pitch-c4-calc', entityId: 'pitch-c4-12tet', phenomenon: '12-TET note frequency', quantity: 'fundamental frequency', processType: 'derived' });
RECORDS.push({
  id: 'r-c4-12tet', entityId: 'pitch-c4-12tet', processId: 'pitch-c4-calc', categories: ['music'], evidence: 'application-derived', role: 'source frequency',
  hz: { value: 440 * Math.pow(2, -9 / 12), by: 'app', equation: 'f(n) = 440 Hz · 2^(n/12), n = −9' },
  original: { value: -9, unit: 'semitones from A4', text: 'n = −9 semitones from A4' },
  method: 'Calculated from ISO 16 reference with the 12-TET equation', conditions: { 'tuning system': '12-tone equal temperament', reference: 'A4 = 440 Hz' },
  sourceIds: ['iso16'], hasTimeSeries: false, hasSpectrum: false,
  notes: ['Other tuning systems give a different C4; comparison of tuning systems is a later feature.'],
});

// ---- Organs: heart rate & circadian ------------------------------------------------------
ENTITIES.push({ id: 'organ-heart', name: 'Human heart (adult, at rest)', categories: ['organs'], description: 'Cardiac rhythm counted as beats per minute.' });
PROCESSES.push({ id: 'heart-rest-rate', entityId: 'organ-heart', phenomenon: 'Resting heart rate', quantity: 'beat rate', processType: 'physiological rhythm' });
RECORDS.push({
  id: 'r-heart-rest', entityId: 'organ-heart', processId: 'heart-rest-rate', categories: ['organs', 'muscles'], evidence: 'documented-range', role: 'source frequency',
  hz: { min: 1, max: sig(100 / 60, 4), by: 'app', equation: 'f = rate / 60 (beats/min → Hz)', note: 'Heartbeat is a quasi-periodic rhythm; beat-to-beat intervals vary. Conversion applies to the average rate.' },
  original: { min: 60, max: 100, unit: 'beats/min', text: '60 to 100 beats per minute (adults, resting)' },
  uncertainty: 'Typical population range, not an individual measurement.', method: 'Clinical reference range', conditions: { population: 'adults', state: 'at rest' },
  sourceIds: ['mayo-hr'], hasTimeSeries: false, hasSpectrum: false,
  notes: ['Signal diagnostics only; Reflection makes no medical diagnosis (spec §2.10).'],
});
ENTITIES.push({ id: 'circadian-system', name: 'Circadian timing system (organisms)', categories: ['organs', 'cells', 'plants', 'hormones'], description: 'Physical, mental and behavioural changes following a daily cycle.' });
PROCESSES.push({ id: 'circadian-cycle', entityId: 'circadian-system', phenomenon: 'Circadian rhythm', quantity: 'cycle period', processType: 'physiological rhythm' });
RECORDS.push({
  id: 'r-circadian', entityId: 'circadian-system', processId: 'circadian-cycle', categories: ['organs', 'cells', 'plants', 'hormones'], evidence: 'documented-range', role: 'source frequency',
  hz: { value: sig(1 / 86400, 2), by: 'app', equation: 'f = 1 / (24 h × 3600 s/h)', sigFigs: 2, note: 'Approximate: the source describes "a 24-hour cycle".' },
  original: { value: 24, unit: 'hours', text: 'about a 24-hour cycle' },
  uncertainty: 'Descriptive value; free-running periods differ between organisms and individuals.', method: 'Educational definition', conditions: { scope: 'organisms in general' },
  sourceIds: ['nigms-circ'], hasTimeSeries: false, hasSpectrum: false,
});

// ---- Hydrodynamics: NDBC analysis band -------------------------------------------------
ENTITIES.push({ id: 'ndbc-dwa', name: 'NDBC Directional Wave Analyzer spectrum', categories: ['hydro'], description: 'Frequency bands used by NOAA NDBC to report ocean-wave spectra.' });
PROCESSES.push({ id: 'ndbc-dwa-bands', entityId: 'ndbc-dwa', phenomenon: 'Spectral analysis band layout', quantity: 'band centre frequency', processType: 'analysis configuration' });
RECORDS.push({
  id: 'r-ndbc-dwa', entityId: 'ndbc-dwa', processId: 'ndbc-dwa-bands', categories: ['hydro', 'electronics'], evidence: 'defined-standard', role: 'analysis band',
  hz: { min: 0.03, max: 0.40, by: 'source', note: 'Band centres 0.03–0.40 Hz, each 0.01 Hz wide.' },
  original: { min: 0.03, max: 0.40, unit: 'Hz', text: '0.03 to 0.40 Hz centre frequencies, 0.01 Hz bandwidth' },
  method: 'Data-product configuration', conditions: { instrument: 'NDBC DWA', bandwidth: '0.01 Hz' },
  sourceIds: ['ndbc-spectra'], hasTimeSeries: false, hasSpectrum: false,
  notes: ['This is the range an instrument reports, not the frequency of any particular wave.'],
});

export function sourceById(id: string) { return SOURCES.find((s) => s.id === id); }
export function entityById(id: string) { return ENTITIES.find((e) => e.id === id); }
export function processById(id: string) { return PROCESSES.find((p) => p.id === id); }

/** Representative Hz of a record (value, or geometric centre of a range). */
export function recordHz(r: DataRecord): number | undefined {
  if (!r.hz) return undefined;
  if (r.hz.value !== undefined) return r.hz.value;
  if (r.hz.min !== undefined && r.hz.max !== undefined) return Math.sqrt(r.hz.min * r.hz.max);
  return undefined;
}

export interface SearchQuery {
  text: string;
  hzMin?: number;
  hzMax?: number;
  evidence?: string;
  category?: string;
  mode: 'overlap' | 'exact';
}

export interface SearchHit { record: DataRecord; why: string[] }

export function searchRecords(q: SearchQuery): SearchHit[] {
  const hits: SearchHit[] = [];
  const t = q.text.trim().toLowerCase();
  for (const r of RECORDS) {
    const why: string[] = [];
    if (q.category && !r.categories.includes(q.category)) continue;
    if (q.evidence && r.evidence !== q.evidence) continue;
    if (t) {
      const e = entityById(r.entityId)!; const p = processById(r.processId)!;
      const fields: [string, string][] = [
        ['name', e.name], ['alias', (e.aliases ?? []).join(' ')], ['process', p.phenomenon], ['quantity', p.quantity],
        ['method', r.method], ['source', r.sourceIds.map((s) => sourceById(s)?.title ?? '').join(' ')],
        ['conditions', Object.entries(r.conditions).map(([k, v]) => `${k} ${v}`).join(' ')],
      ];
      const matched = fields.filter(([, v]) => v.toLowerCase().includes(t));
      if (!matched.length) continue;
      why.push(`text “${q.text}” in ${matched.map((m) => m[0]).join(', ')}`);
    }
    if (q.hzMin !== undefined || q.hzMax !== undefined) {
      if (!r.hz) continue;
      const lo = r.hz.value ?? r.hz.min!, hi = r.hz.value ?? r.hz.max!;
      const qlo = q.hzMin ?? 0, qhi = q.hzMax ?? Infinity;
      const ok = q.mode === 'exact' ? lo >= qlo && hi <= qhi : hi >= qlo && lo <= qhi;
      if (!ok) continue;
      why.push(q.mode === 'exact' ? 'Hz value lies inside the range' : 'Hz range overlaps the query');
    }
    if (!why.length) why.push(q.category ? 'in selected category' : 'all records');
    hits.push({ record: r, why });
  }
  return hits;
}
