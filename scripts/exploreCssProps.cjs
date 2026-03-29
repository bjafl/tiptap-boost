const { getShorthandsForProperty, getShorthandComputedProperties, isShorthandProperty } = require('css-property-parser');

const relevantProps = [
  'border',
  'background',
  'padding',
  'margin',
  'height',
  'width',
  'text-align',
  'vertical-align',
]

const expandedProps = Object.fromEntries(relevantProps.map((targetProp) => [targetProp, getShorthandComputedProperties(targetProp, true)]));

console.log(expandedProps);

const shorthands = Object.fromEntries(relevantProps.map((prop) => [prop, getShorthandsForProperty(prop)]).filter(([_, shorthands]) => shorthands.length > 1));
console.log();
if (Object.keys(shorthands).length > 0) {
  console.log('Properties with shorthands:', shorthands);
} else {
  console.log('No properties with shorthands found.');
}