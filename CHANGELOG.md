# Changelog

## [0.5.0](https://github.com/nodrel-dev/n8n-ups-node/compare/v0.4.0...v0.5.0) (2026-06-19)


### Features

* **node:** improve credential/parameter UX (cognitive-load recipes A,B,D,E,F) ([#21](https://github.com/nodrel-dev/n8n-ups-node/issues/21)) ([e3d647c](https://github.com/nodrel-dev/n8n-ups-node/commit/e3d647ceea06d5edd7c8f2de8b9acdbdd3ab0866))

## [0.4.0](https://github.com/nodrel-dev/n8n-ups-node/compare/v0.3.1...v0.4.0) (2026-06-19)


### Features

* **shipping:** add optional UPS Shipper Profile credential (FE-001) ([#17](https://github.com/nodrel-dev/n8n-ups-node/issues/17)) ([7dd3001](https://github.com/nodrel-dev/n8n-ups-node/commit/7dd3001c4a35ddfe7c5d8aa02924273702abb361))

## [0.3.1](https://github.com/nodrel-dev/n8n-nodes-ups/compare/v0.3.0...v0.3.1) (2026-06-19)


### Bug Fixes

* **ci:** upgrade npm to &gt;=11.5.1 so OIDC trusted publishing authenticates ([#14](https://github.com/nodrel-dev/n8n-nodes-ups/issues/14)) ([90593c9](https://github.com/nodrel-dev/n8n-nodes-ups/commit/90593c906d0c42cd2a1965b015cb77840022a5ab))

## [0.3.0](https://github.com/nodrel-dev/n8n-nodes-ups/compare/v0.2.2...v0.3.0) (2026-06-19)


### Features

* rescope npm package to @nodrel-dev/n8n-nodes-ups + integration docs ([#12](https://github.com/nodrel-dev/n8n-nodes-ups/issues/12)) ([56ec3a4](https://github.com/nodrel-dev/n8n-nodes-ups/commit/56ec3a4fc0504edbf1902fd8fdccc560031cc186))

## [0.2.2](https://github.com/nodrel-dev/n8n-nodes-ups/compare/v0.2.1...v0.2.2) (2026-06-19)


### Bug Fixes

* **release:** set publishConfig access public for provenance; fix CI concurrency ([#10](https://github.com/nodrel-dev/n8n-nodes-ups/issues/10)) ([f350e33](https://github.com/nodrel-dev/n8n-nodes-ups/commit/f350e33c6036af07d195c72068ca3edecf08c67e))

## [0.2.1](https://github.com/nodrel-dev/n8n-nodes-ups/compare/v0.2.0...v0.2.1) (2026-06-19)


### Bug Fixes

* **release:** set empty component for single-package release-please ([#7](https://github.com/nodrel-dev/n8n-nodes-ups/issues/7)) ([e553097](https://github.com/nodrel-dev/n8n-nodes-ups/commit/e5530978a7ac4d4cf24d7a1c852c0f5a414fc605))

## [0.2.0](https://github.com/nodrel-dev/n8n-nodes-ups/compare/v0.1.0...v0.2.0) (2026-06-19)


### Features

* **ups:** verified UPS node — track, validate, rate, create ([#1](https://github.com/nodrel-dev/n8n-nodes-ups/issues/1)) ([fc3e0c5](https://github.com/nodrel-dev/n8n-nodes-ups/commit/fc3e0c54fb3da13c1a95358c823b861ae54e1ff8))


### Bug Fixes

* **create:** send LabelStockSize for thermal labels; correct boundary-error docs ([#3](https://github.com/nodrel-dev/n8n-nodes-ups/issues/3)) ([fa83b88](https://github.com/nodrel-dev/n8n-nodes-ups/commit/fa83b88e076bb4e585d68d36f84de85958369897))
* **hooks:** drop scan from git hooks; it scans published npm packages, not local source ([98ec838](https://github.com/nodrel-dev/n8n-nodes-ups/commit/98ec83812bff6042825acbce613739d8dea797e1))
* **hooks:** move scan to pre-push, add npx --yes ([0192488](https://github.com/nodrel-dev/n8n-nodes-ups/commit/01924885b83b779f088edcf3ff8c977a60223a29))
* **shipping:** fix Rate/Create param throw, international customs, and surface charges ([#2](https://github.com/nodrel-dev/n8n-nodes-ups/issues/2)) ([8387925](https://github.com/nodrel-dev/n8n-nodes-ups/commit/8387925ff72e280a664ce84b0b97fb3a302f8feb))
