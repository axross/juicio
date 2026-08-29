/**
 * the prop contract every icon in this directory shares: a caller-resolved
 * colour (see docs/conventions/design-system.md's Icon Set, and
 * react-component-styling's "Reading a Token Outside a Stylesheet" — a
 * caller reads the colour from `theme` and passes it in, an icon never
 * imports the theme itself) and an optional size override, since every icon
 * is drawn on a 24×24 canvas by default.
 */
export type IconProps = {
  /** resolved from a theme colour token by the caller. */
  color: string;
  /** both width and height; the icon's square canvas. defaults to 24. */
  size?: number;
  testID?: string;
};
