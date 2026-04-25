// @ts-expect-error `prop-types` is imported by file path intentionally to avoid
// Vite's CJS namespace interop issue with `import * as PropTypes`.
import PropTypes from "../../node_modules/prop-types/index.js";

export default PropTypes;

export const {
  any,
  array,
  arrayOf,
  bigint,
  bool,
  checkPropTypes,
  element,
  elementType,
  exact,
  func,
  instanceOf,
  node,
  object,
  objectOf,
  oneOf,
  oneOfType,
  resetWarningCache,
  shape,
  string,
  symbol
} = PropTypes;
