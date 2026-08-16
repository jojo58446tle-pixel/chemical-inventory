const GROUPS = [
  ['PAINT_IN_THREAD', ['paint in thread', 'paint inside thread', 'painted thread', 'thread paint', 'สีในเกลียว', 'เกลียวมีสี']],
  ['EDGE_PAINT_CHIPPING', ['edge paint chipping', 'paint chip edge', 'edge chipping', 'สีลอกขอบ', 'สีบิ่นขอบ']],
  ['SCRATCH', ['scratch', 'scratched', 'รอยขีดข่วน', 'รอยแผล']],
  ['CORROSION', ['corrosion', 'rust', 'สนิม']],
  ['COATING_THICKNESS', ['paint thickness', 'coating thickness', 'ความหนาสี']],
  ['PACKAGING_DAMAGE', ['packaging', 'pallet', 'box damage', 'บรรจุภัณฑ์', 'พาเลท']],
  ['RIVET', ['rivet', 'pem', 'รีเวท']],
  ['PAINT_APPEARANCE', ['paint sag', 'orange peel', 'pin hole', 'pinhole', 'bubble', 'สีไหล', 'ผิวส้ม']]
];

export function normalizeDefect(value = '') {
  const cleaned = String(value).trim().toLowerCase().replace(/[_/\\-]+/g, ' ').replace(/\s+/g, ' ');
  const match = GROUPS.find(([, terms]) => terms.some((term) => cleaned.includes(term)));
  if (match) return match[0];
  return cleaned ? cleaned.toUpperCase().replace(/[^A-Z0-9ก-๙]+/g, '_').replace(/^_|_$/g, '') : 'OTHER';
}

export function inspectionFocusFor(normalizedDefect) {
  const map = {
    PAINT_IN_THREAD: ['Thread area', 'Masking condition', 'Bolt assembly characteristic'],
    EDGE_PAINT_CHIPPING: ['Previous defect location', 'Edge area', 'Exposed base-metal condition'],
    SCRATCH: ['Previous defect location', 'Contact surface', 'Packaging contact point'],
    CORROSION: ['Previous defect location', 'Cut edge', 'Surface protection condition'],
    COATING_THICKNESS: ['Previous NG characteristic', 'Critical coating area', 'Specified measuring points'],
    PACKAGING_DAMAGE: ['Pallet stability', 'Packaging contact point', 'Part protection condition'],
    RIVET: ['Rivet area', 'Fastener installation characteristic', 'Assembly fit'],
    PAINT_APPEARANCE: ['Previous defect location', 'Painted surface', 'Critical appearance area']
  };
  return map[normalizedDefect] || ['Previous defect location', 'Affected characteristic', 'Final appearance/fit condition'];
}
