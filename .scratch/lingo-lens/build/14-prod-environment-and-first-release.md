# 14: Prod environment and first release

Spec: [../spec.md](../spec.md) (Infrastructure and CI; Further Notes)

**What to build:** Lingo Lens is live on its prod custom domain, released by promoting the exact build that was tested on dev after a required approval. One Document and one Image translate end to end on prod. This is HITL: it needs the domain, approvers and alert recipients from the organisation.

**Blocked by:** [03: Infrastructure bootstrap and dev deploy](03-infrastructure-bootstrap-and-dev-deploy.md), [07: Retention: 1-hour sweep and Expired](07-retention-sweep-and-expired.md), [08: Quotas, kill switch and guardrails](08-quotas-kill-switch-and-guardrails.md), [12: Accessibility gate](12-accessibility-gate.md), [13: Refine error rules and timeouts from real Azure](13-refine-error-rules-and-timeouts.md)

**Status:** ready-for-human

- [ ] The prod parameters are filled in: Budget alert recipients (a shared mailbox or distribution list), the required reviewer(s) on the `prod` GitHub Environment, and the custom domain `lingolens.<org-domain>` (a CNAME from the DNS team)
- [ ] Prod storage CORS allows only the prod origin
- [ ] The prod infrastructure is deployed through the infra workflow, and the app workflow promotes the same artifacts from dev to prod after approval
- [ ] **Smoke test on prod:** one Document and one Image translate end to end, the files are gone afterwards, and a quota refusal and the kill switch each behave as expected
- [ ] Budget alerts are confirmed reaching the recipients (a test notification)
