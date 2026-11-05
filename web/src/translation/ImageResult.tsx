import { Badge, Button, Switch, Text, makeStyles, mergeClasses, tokens, typographyStyles } from '@fluentui/react-components';
import type { ImageTranslationResult, Language } from '@lingo-lens/shared';
import { useId, useState, type Ref } from 'react';
import { useBlockLinking } from './useBlockLinking';

/**
 * The Image result screen, variant A of the prototype: the original Image
 * (sticky) with its regions outlined, beside one card per paragraph.
 *
 * Ticket 06 adds the interaction (hover/focus preview, selected block, linking
 * both ways, Show original), the highlight styling and the stacked layout
 * below 768 px. Ticket 10 adds the no-text state.
 */
/** Below 768 CSS px the two columns stack (spec: Status, errors and accessibility). */
const NARROW = '@media (max-width: 767.98px)';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  fileName: {
    ...typographyStyles.subtitle1,
    margin: 0,
    overflowWrap: 'anywhere',
  },
  spacer: { flexGrow: 1 },
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalXL,
    alignItems: 'start',
    [NARROW]: {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: tokens.spacingVerticalM,
    },
  },
  imageCard: {
    position: 'sticky',
    top: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow4,
    /** Stacked: pinned to the top at up to 40% of the screen, cards scroll underneath. */
    [NARROW]: {
      top: 0,
      zIndex: 1,
      boxSizing: 'border-box',
      maxHeight: '40vh',
      padding: tokens.spacingHorizontalS,
      display: 'flex',
      justifyContent: 'center',
    },
  },
  /** Shrink-wraps the Image so the overlay covers exactly the drawn pixels. */
  stage: {
    position: 'relative',
    lineHeight: 0,
    [NARROW]: {
      width: 'fit-content',
      maxWidth: '100%',
    },
  },
  image: {
    display: 'block',
    width: '100%',
    height: 'auto',
    borderRadius: tokens.borderRadiusMedium,
    [NARROW]: {
      width: 'auto',
      maxWidth: '100%',
      maxHeight: `calc(40vh - 2 * ${tokens.spacingHorizontalS})`,
    },
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  /** Resting region: a faint dashed outline, so the text areas are discoverable. */
  region: {
    fill: 'transparent',
    stroke: 'rgba(255, 255, 255, 0.7)',
    strokeWidth: '2px',
    strokeDasharray: '4 3',
    vectorEffect: 'non-scaling-stroke',
    pointerEvents: 'all',
    cursor: 'pointer',
  },
  regionActive: {
    fill: 'rgba(255, 255, 255, 0.28)',
    stroke: 'none',
  },
  regionDimmed: {
    fill: 'rgba(0, 0, 0, 0.3)',
    stroke: 'none',
  },
  /**
   * The highlight outline (WCAG 1.4.11, 3:1 over any photo): two strokes on the
   * same path, a 6 px near-black one under a 2 px white one, so 2 px of dark
   * shows on each side of 2 px of white. One of the two always contrasts.
   */
  halo: {
    pointerEvents: 'none',
    fill: 'none',
    strokeLinejoin: 'round',
  },
  haloOuter: {
    stroke: '#1b1a19',
    strokeWidth: '6px',
    vectorEffect: 'non-scaling-stroke',
  },
  haloInner: {
    stroke: '#ffffff',
    strokeWidth: '2px',
    vectorEffect: 'non-scaling-stroke',
  },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  listHeadRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
  },
  listHead: {
    margin: 0,
    color: tokens.colorNeutralForeground3,
  },
  card: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow4,
    borderLeft: `${tokens.strokeWidthThickest} solid transparent`,
    cursor: 'pointer',
    outlineOffset: '2px',
    scrollMarginTop: tokens.spacingVerticalM,
    [NARROW]: {
      // Keep a revealed card clear of the pinned Image.
      scrollMarginTop: 'calc(40vh + 8px)',
    },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
    },
  },
  /** The previewed or selected block's card. */
  cardActive: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  cardSelected: {
    borderLeftColor: tokens.colorBrandStroke1,
  },
  translation: {
    ...typographyStyles.body2,
    display: 'block',
    overflowWrap: 'anywhere',
  },
  original: {
    ...typographyStyles.caption1,
    display: 'block',
    marginTop: tokens.spacingVerticalXS,
    color: tokens.colorNeutralForeground3,
    overflowWrap: 'anywhere',
  },
});

const displayNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch {
    return undefined;
  }
})();

/** English name of a language code: Translator's own list first, then the browser's. */
export function languageName(code: string, languages: readonly Language[]): string {
  const known = languages.find((l) => l.code.toLowerCase() === code.toLowerCase());
  if (known) return known.name;
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** SVG `points` from a flat `[x1, y1, x2, y2, ...]` polygon, in the page's own units. */
const toPoints = (polygon: readonly number[]) =>
  polygon
    .reduce<string[]>((pairs, value, i) => {
      if (i % 2 === 0) pairs.push(String(value));
      else pairs[pairs.length - 1] += `,${value}`;
      return pairs;
    }, [])
    .join(' ');

export interface ImageResultProps {
  fileName: string;
  imageUrl: string;
  result: ImageTranslationResult;
  targetLanguage: string;
  languages: readonly Language[];
  headingRef: Ref<HTMLHeadingElement>;
  onNewTranslation: () => void;
}

export function ImageResult({
  fileName,
  imageUrl,
  result,
  targetLanguage,
  languages,
  headingRef,
  onNewTranslation,
}: ImageResultProps) {
  const styles = useStyles();
  const [copied, setCopied] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const { active, selected, cardProps, regionProps, cardRef } = useBlockLinking();
  const listHeadId = useId();
  const { page, paragraphs } = result;
  const count = paragraphs.length;
  const blocks = `${count} text ${count === 1 ? 'block' : 'blocks'}`;
  const target = languageName(targetLanguage, languages);
  const languagePair = result.detectedLanguage
    ? `${languageName(result.detectedLanguage, languages)} (detected) → ${target}`
    : target;

  const copy = () => {
    navigator.clipboard.writeText(paragraphs.map((p) => p.translation).join('\n\n')).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <h2 className={styles.fileName} ref={headingRef} tabIndex={-1}>
          {fileName}
        </h2>
        <Badge appearance="outline" color="informative">
          {languagePair}
        </Badge>
        <Badge appearance="tint" color="success">
          Ready
        </Badge>
        <Badge appearance="outline" color="informative">
          {blocks}
        </Badge>
        {result.isHandwritten && (
          <Badge appearance="tint" color="warning">
            Handwriting detected: check the translation
          </Badge>
        )}
        <span className={styles.spacer} />
        {count > 0 && <Button onClick={copy}>Copy translated text</Button>}
        <Button appearance="primary" onClick={onNewTranslation}>
          New Translation
        </Button>
        <Text aria-live="polite" size={200}>
          {copied ? 'Copied' : ''}
        </Text>
      </div>

      <div className={styles.split}>
        <div className={styles.imageCard}>
          <div className={styles.stage}>
            <img className={styles.image} src={imageUrl} alt={`${fileName}, ${blocks} found`} />
            <svg
              className={styles.overlay}
              data-overlay=""
              viewBox={`0 0 ${page.width} ${page.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {paragraphs.map((p, i) => (
                <polygon
                  key={i}
                  className={mergeClasses(
                    styles.region,
                    active !== null && (i === active ? styles.regionActive : styles.regionDimmed),
                  )}
                  data-region=""
                  data-state={active === null ? undefined : i === active ? 'active' : 'dimmed'}
                  points={toPoints(p.polygon)}
                  {...regionProps(i)}
                />
              ))}
              {active !== null && paragraphs[active] && (
                <g className={styles.halo}>
                  <path className={styles.haloOuter} d={`M ${toPoints(paragraphs[active].polygon)} Z`} />
                  <path className={styles.haloInner} d={`M ${toPoints(paragraphs[active].polygon)} Z`} />
                </g>
              )}
            </svg>
          </div>
        </div>

        <div>
          <div className={styles.listHeadRow}>
            <Text as="p" className={styles.listHead} id={listHeadId}>
              Translated text
            </Text>
            <Switch label="Show original" labelPosition="before" checked={showOriginal} onChange={(_, data) => setShowOriginal(data.checked)} />
          </div>
          <ul className={styles.list} aria-labelledby={listHeadId}>
            {paragraphs.map((p, i) => (
              <li
                key={i}
                ref={cardRef(i)}
                className={mergeClasses(styles.card, i === active && styles.cardActive, i === selected && styles.cardSelected)}
                data-card=""
                data-state={i === active ? 'active' : undefined}
                aria-current={i === selected ? 'true' : undefined}
                tabIndex={0}
                {...cardProps(i)}
              >
                <span className={styles.translation} lang={targetLanguage}>
                  {p.translation}
                </span>
                {showOriginal && (
                  <span className={styles.original} lang={p.detectedLanguage ?? result.detectedLanguage}>
                    {p.original}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
