# infra

Bicep templates for Lingo Lens (dev and prod). Empty for now: the bootstrap and main templates arrive with the infrastructure ticket (`.scratch/lingo-lens/build/03-infrastructure-bootstrap-and-dev-deploy.md`).

When templates exist, validate them locally with the Azure CLI:

```sh
az bicep build --file infra/main.bicep
```

There are no npm scripts or tests here yet, so the root `npm run …` commands skip this workspace.
