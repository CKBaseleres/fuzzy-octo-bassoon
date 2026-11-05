import { Title1, makeStyles, tokens } from '@fluentui/react-components';
import { DocumentTranslation } from './translation/DocumentTranslation';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXL,
  },
});

export function App() {
  const styles = useStyles();

  return (
    <main className={styles.root}>
      <Title1 as="h1">Lingo Lens</Title1>
      <DocumentTranslation />
    </main>
  );
}
