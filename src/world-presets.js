import { CITY_BLOCK, sampleCity } from './city-block.js';
import { APARTMENTS, NIGHT_MARKET, TRAIN_CARRIAGE, sampleApartments, sampleNightMarket, sampleTrain } from './neighborhood-scenes.js';
import { cityBackgroundSVG, cityPropSVG } from './city-art.js';
import { apartmentsBackgroundSVG, nightMarketBackgroundSVG, neighborhoodPropSVG } from './neighborhood-art.js';
import { trainBackgroundSVG, trainPropSVG } from './train-art.js';

// These fixed worlds share playback but do not enter the two-character editor format.
export const WORLD_PRESETS = [
  { ...CITY_BLOCK, category: 'Daily life', sample: sampleCity, renderBackground: cityBackgroundSVG, renderProp: prop => cityPropSVG(prop.type) },
  { ...APARTMENTS, sample: sampleApartments, renderBackground: apartmentsBackgroundSVG, renderProp: neighborhoodPropSVG },
  { ...NIGHT_MARKET, sample: sampleNightMarket, renderBackground: nightMarketBackgroundSVG, renderProp: neighborhoodPropSVG },
  { ...TRAIN_CARRIAGE, sample: sampleTrain, renderBackground: trainBackgroundSVG, renderProp: trainPropSVG },
];

export const getWorldPreset = id => WORLD_PRESETS.find(preset => preset.id === id);
