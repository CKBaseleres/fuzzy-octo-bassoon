import { Badge, Button, Text, makeStyles, tokens, typographyStyles } from '@fluentui/react-components';
import type { ImageTranslationResult, Language } from '@lingo-lens/shared';
import { useId, useState, type Ref } from 'react';

/**
 * The Image result screen, variant A of the prototype: the original Image
 * (sticky) with its regions outlined, beside one card per paragraph.
 *
 * Ticket 06 adds the interaction (hover/focus preview, selected block, linking
 * both ways, Show original), the highlight styling and the stacked layout
 * below 768 px. Ticket 10 adds the no-text state.
 */
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
  },
  imageCard: {
    position: 'sticky',
    top: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow4,
  },
  stage: {
    position: 'relative',
    lineHeight: 0,
  },
  image: {
    display: 'block',
    width: '100%',
    height: 'auto',
    borderRadius: tokens.borderRadiusMedium,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  region: {
    fill: 'transparent',
    stroke: 'rgba(255, 255, 255, 0.7)',
    strokeWidth: '2px',
    strokeDasharray: '4 3',
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
  listHead: {
    color: tokens.colorNeutralForeground3,
  },
  card: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow4,
    borderLeft: `${tokens.strokeWidthThickest} solid transparent`,
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
                <polygon key={i} className={styles.region} points={toPoints(p.polygon)} />
              ))}
            </svg>
          </div>
        </div>

        <div>
          <Text as="p" className={styles.listHead} id={listHeadId}>
            Translated text
          </Text>
          <ul className={styles.list} aria-labelledby={listHeadId}>
            {paragraphs.map((p, i) => (
              <li key={i} className={styles.card}>
                <span className={styles.translation} lang={targetLanguage}>
                  {p.translation}
                </span>
                <span className={styles.original} lang={p.detectedLanguage ?? result.detectedLanguage}>
                  {p.original}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
