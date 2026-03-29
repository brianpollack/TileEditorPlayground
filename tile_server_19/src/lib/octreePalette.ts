interface OctreeNode {
  blueSum: number;
  children: Array<OctreeNode | null>;
  count: number;
  greenSum: number;
  isLeaf: boolean;
  nextReducible: OctreeNode | null;
  redSum: number;
}

interface OctreeLeafColor {
  blue: number;
  count: number;
  green: number;
  red: number;
}

const MAX_DEPTH = 8;

function createNode(level: number, reducible: Array<OctreeNode | null>, leafCountRef: { value: number }) {
  const node: OctreeNode = {
    blueSum: 0,
    children: Array<OctreeNode | null>(8).fill(null),
    count: 0,
    greenSum: 0,
    isLeaf: level === MAX_DEPTH,
    nextReducible: null,
    redSum: 0
  };

  if (node.isLeaf) {
    leafCountRef.value += 1;
  } else {
    node.nextReducible = reducible[level];
    reducible[level] = node;
  }

  return node;
}

function getChildIndex(red: number, green: number, blue: number, level: number) {
  const shift = 7 - level;
  const redBit = (red >> shift) & 1;
  const greenBit = (green >> shift) & 1;
  const blueBit = (blue >> shift) & 1;

  return (redBit << 2) | (greenBit << 1) | blueBit;
}

function addColor(
  node: OctreeNode,
  red: number,
  green: number,
  blue: number,
  level: number,
  reducible: Array<OctreeNode | null>,
  leafCountRef: { value: number }
) {
  if (node.isLeaf) {
    node.count += 1;
    node.redSum += red;
    node.greenSum += green;
    node.blueSum += blue;
    return;
  }

  const childIndex = getChildIndex(red, green, blue, level);

  if (!node.children[childIndex]) {
    node.children[childIndex] = createNode(level + 1, reducible, leafCountRef);
  }

  const child = node.children[childIndex];

  if (child) {
    addColor(child, red, green, blue, level + 1, reducible, leafCountRef);
  }
}

function reduceTree(reducible: Array<OctreeNode | null>, leafCountRef: { value: number }) {
  let level = MAX_DEPTH - 1;

  while (level >= 0 && !reducible[level]) {
    level -= 1;
  }

  const node = reducible[level];

  if (!node) {
    return;
  }

  reducible[level] = node.nextReducible;

  let childLeafCount = 0;

  for (const child of node.children) {
    if (!child) {
      continue;
    }

    node.redSum += child.redSum;
    node.greenSum += child.greenSum;
    node.blueSum += child.blueSum;
    node.count += child.count;
    childLeafCount += 1;
  }

  node.children.fill(null);
  node.isLeaf = true;
  leafCountRef.value -= Math.max(0, childLeafCount - 1);
}

function collectLeafColors(node: OctreeNode, colors: OctreeLeafColor[]) {
  if (node.isLeaf) {
    if (node.count > 0) {
      colors.push({
        blue: Math.round(node.blueSum / node.count),
        count: node.count,
        green: Math.round(node.greenSum / node.count),
        red: Math.round(node.redSum / node.count)
      });
    }

    return;
  }

  for (const child of node.children) {
    if (child) {
      collectLeafColors(child, colors);
    }
  }
}

function componentToHex(value: number) {
  return value.toString(16).padStart(2, "0");
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;
}

export function extractOctreePalette(
  imageData: ImageData,
  maxColors: number,
  fallbackColors: string[] = []
) {
  const reducible: Array<OctreeNode | null> = Array(MAX_DEPTH).fill(null);
  const leafCountRef = { value: 0 };
  const root = createNode(0, reducible, leafCountRef);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3] ?? 0;

    if (alpha === 0) {
      continue;
    }

    const red = imageData.data[index] ?? 0;
    const green = imageData.data[index + 1] ?? 0;
    const blue = imageData.data[index + 2] ?? 0;

    addColor(root, red, green, blue, 0, reducible, leafCountRef);

    while (leafCountRef.value > maxColors) {
      reduceTree(reducible, leafCountRef);
    }
  }

  const colors: OctreeLeafColor[] = [];
  collectLeafColors(root, colors);

  const palette = colors
    .sort((left, right) => right.count - left.count)
    .map((color) => rgbToHex(color.red, color.green, color.blue));

  for (const fallbackColor of fallbackColors) {
    if (palette.length >= maxColors) {
      break;
    }

    if (!palette.includes(fallbackColor)) {
      palette.push(fallbackColor);
    }
  }

  return palette.slice(0, maxColors);
}
