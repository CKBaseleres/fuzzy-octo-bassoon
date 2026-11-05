import { Text, Title1, makeStyles, tokens } from '@fluentui/react-components';
import type { HealthResponse } from '@lingo-lens/shared';
import { useEffect, useState } from 'react';
import { getHealth } from './api/client';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXL,
  },
});

export function App() {
  const styles = useStyles();
  const [health, setHealth] = useState<HealthResponse | 'unreachable' | undefined>();

  useEffect(() => {
    let active = true;
    getHealth().then(
      (body) => active && setHealth(body),
      () => active && setHealth('unreachable'),
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className={styles.root}>
      <Title1 as="h1">Lingo Lens</Title1>
      <Text role="status">
        {health === undefined
          ? 'Checking API…'
          : health === 'unreachable'
            ? 'API status: unreachable'
            : `API status: ${health.status}`}
      </Text>
    </main>
  );
}
