import type { Translation } from './locale';
import type { AtlasConstraint, Location, TerrainFeature, TravelRoute } from './project.generated';

const english = {
  location: {
    capital: 'capital', city: 'city', town: 'town', village: 'village', port: 'port',
    fortress: 'fortress', ruin: 'ruin', dungeon: 'dungeon', landmark: 'landmark',
    forest: 'forest', underground: 'underground', reservoir: 'reservoir',
  } satisfies Record<Location['kind'], string>,
  feature: {
    river: 'river', ridge: 'ridge', grove: 'grove', dunes: 'dunes', lake: 'lake', basin: 'basin',
  } satisfies Record<TerrainFeature['kind'], string>,
  route: {
    road: 'road', sea: 'sea', trail: 'trail', pass: 'pass', bridge: 'bridge',
    tunnel: 'tunnel', canal: 'canal', aqueduct: 'aqueduct',
  } satisfies Record<TravelRoute['mode'], string>,
  relation: {
    near: 'near', beneath: 'beneath', separates: 'separates', travel: 'travel', river: 'river',
    inside: 'inside', outside: 'outside', canal: 'canal', aqueduct: 'aqueduct',
  } satisfies Record<AtlasConstraint['relation'], string>,
  strength: { hard: 'hard', soft: 'soft' } satisfies Record<AtlasConstraint['strength'], string>,
  origin: { owner: 'owner', scenario: 'scenario', proposal: 'proposal' } satisfies Record<AtlasConstraint['origin'], string>,
  severity: { error: 'error', warning: 'warning', info: 'info' },
  biomes: {
    '~': 'Ocean', l: 'Inland lake', m: 'Mountains', h: 'Hills', v: 'River valley',
    p: 'Plains', f: 'Woodland', d: 'Dryland', s: 'Alpine snow',
  },
  cells: (count: string) => count + ' cells',
  unplaced: 'Unplaced',
  regions: 'Regions',
  territories: 'Territories',
  locations: 'Locations',
  routes: 'Routes',
};

const korean: Translation<typeof english> = {
  location: {
    capital: '수도', city: '도시', town: '소도시', village: '마을', port: '항구',
    fortress: '요새', ruin: '유적', dungeon: '던전', landmark: '랜드마크',
    forest: '숲', underground: '지하', reservoir: '저수지',
  },
  feature: { river: '강', ridge: '산줄기', grove: '수림', dunes: '사구', lake: '호수', basin: '분지' },
  route: {
    road: '도로', sea: '해로', trail: '오솔길', pass: '산길', bridge: '다리',
    tunnel: '터널', canal: '운하', aqueduct: '수로',
  },
  relation: {
    near: '근접', beneath: '아래', separates: '사이로 분리', travel: '이동', river: '강에 인접',
    inside: '내부', outside: '외부', canal: '운하', aqueduct: '수로',
  },
  strength: { hard: '필수', soft: '권장' },
  origin: { owner: '작성자', scenario: '시나리오', proposal: '제안' },
  severity: { error: '오류', warning: '경고', info: '정보' },
  biomes: {
    '~': '바다', l: '내륙 호수', m: '산악', h: '구릉', v: '강 계곡',
    p: '평원', f: '삼림', d: '건조지', s: '고산 설원',
  },
  cells: (count) => count + '칸',
  unplaced: '미배치',
  regions: '지역',
  territories: '영토',
  locations: '장소',
  routes: '경로',
};

export const atlasLabels = { en: english, ko: korean };
