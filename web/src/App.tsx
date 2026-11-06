import { Title1, makeStyles, tokens } from '@fluentui/react-components';
import { TranslationScreen } from './translation/TranslationScreen';

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
      <TranslationScreen />
    </main>
  );
}
