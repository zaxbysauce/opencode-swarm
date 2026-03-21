# Changelog

## [6.31.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.30.2...v6.31.0) (2026-03-21)


### Features

* process.cwd cleanup, curator wiring, watchdog pattern, self-review, and knowledge tools ([#239](https://github.com/zaxbysauce/opencode-swarm/issues/239)) ([573e2a0](https://github.com/zaxbysauce/opencode-swarm/commit/573e2a09c85ee97df52649e057686f49bf43db50))

## [6.30.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.30.1...v6.30.2) (2026-03-21)


### Bug Fixes

* **cli:** replace diverged dispatch switches with unified command registry ([#237](https://github.com/zaxbysauce/opencode-swarm/issues/237)) ([9773939](https://github.com/zaxbysauce/opencode-swarm/commit/97739390110a321818d2872e319a86554cf0969c))

## [6.30.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.30.0...v6.30.1) (2026-03-21)


### Bug Fixes

* cap spawnAsync output, lockfile PM detection, Windows .cmd spawn, curator config, advisory queue drain, and rehydration race guard ([#231](https://github.com/zaxbysauce/opencode-swarm/issues/231)) ([bdb0f16](https://github.com/zaxbysauce/opencode-swarm/commit/bdb0f16eae94dd03fccac8a8de9720d98ba9eca4))

## [6.30.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.29.7...v6.30.0) (2026-03-20)


### Features

* add Curator background analysis system with phase-level drift detection and knowledge injection ([8cf8d07](https://github.com/zaxbysauce/opencode-swarm/commit/8cf8d07ed8383948288fed53b31c6c0d0f8dfc91))
* add next pre-release pipeline for v7.0 beta testing ([a35ebb4](https://github.com/zaxbysauce/opencode-swarm/commit/a35ebb477acd08baadf19437995a97aafbaf93f9))
* **agents:** add defensive coding rules and error handling to coder (C1, C2, X3, X4) ([cbb2220](https://github.com/zaxbysauce/opencode-swarm/commit/cbb22202ecd289b824335abb6d99aacc66ffa87c))
* **agents:** add differential review focus and structured reasoning to reviewer (R1, R2, X3, X4) ([45e9069](https://github.com/zaxbysauce/opencode-swarm/commit/45e9069f90609787d36a7e089e7f3b5a1dd8cde2))
* **agents:** add documentation scope rules to docs (D1, X3, X4) ([e39d22b](https://github.com/zaxbysauce/opencode-swarm/commit/e39d22b9a16e57289a08b3288f5e8f573453f738))
* **agents:** add research protocol and confidence calibration to sme (S1, X3, X4) ([b1f250d](https://github.com/zaxbysauce/opencode-swarm/commit/b1f250d00ba31f20d9265a2a0dad2f9c949c5d3c))
* **agents:** add structured codebase analysis protocol to explorer (E1, X3, X4) ([b2d346c](https://github.com/zaxbysauce/opencode-swarm/commit/b2d346c8867a62e891d63d54768be29bba6a0b31))
* **agents:** complete audit phase 4-6 — remaining 13 deferred items ([d4001fa](https://github.com/zaxbysauce/opencode-swarm/commit/d4001fa0e07d94f429e59a3003078826bc052c66))
* **agents:** complete audit phase 4-6 — remaining 13 deferred items ([d60f3e2](https://github.com/zaxbysauce/opencode-swarm/commit/d60f3e2e0b176c52a8182b1c09d0ae66abdd8ce9))
* **agents:** overhaul test-engineer prompt (T1-T4, X3, X4) ([b830f91](https://github.com/zaxbysauce/opencode-swarm/commit/b830f91ae2b82833607274227484b42977ab2293))
* **gate-enforcement:** add per-task state machine, scope declaration, and hard blocks ([a1ab8ad](https://github.com/zaxbysauce/opencode-swarm/commit/a1ab8adb8378b3402c97184328e61442fd80774f))
* **gate-enforcement:** per-task state machine, scope declaration, and hard blocks (v6.21) ([90324cf](https://github.com/zaxbysauce/opencode-swarm/commit/90324cf53a88a7ad0132f9d8786b084d3e95e035))
* implement glob/path exclude patterns and .secretscanignore support for secretscan ([4271898](https://github.com/zaxbysauce/opencode-swarm/commit/42718983db6f6bed160990a52c0906c3ac886da3))
* implement session durability and Turbo Mode controls (v6.26) ([a87eb95](https://github.com/zaxbysauce/opencode-swarm/commit/a87eb95065985e82f9a158e24cd64dc6dc2902df))
* **secretscan:** glob/path exclude patterns and .secretscanignore support ([4a3a91a](https://github.com/zaxbysauce/opencode-swarm/commit/4a3a91a613710a599831b1f159bf62ece963c957))
* self-correcting workflow hooks, context compaction, and tech debt cleanup ([#212](https://github.com/zaxbysauce/opencode-swarm/issues/212)) ([8fd18c9](https://github.com/zaxbysauce/opencode-swarm/commit/8fd18c9f69d7d37016bab300814f825784db3f1a))
* session durability and Turbo Mode controls (v6.26) ([9d7eb32](https://github.com/zaxbysauce/opencode-swarm/commit/9d7eb32f0a69c06e5566d75c4620c023d7a71cfd))
* **v6.20:** add AST diffing, parallelism framework, PR gate, checkpoint extension, agent output, skill versioning, and context efficiency ([f13ea28](https://github.com/zaxbysauce/opencode-swarm/commit/f13ea285cb862dc0e5dae5e641b560bd5c0ffac5))
* **v6.20:** AST diffing, parallelism framework, PR gate, checkpoint extension, agent output, skill versioning ([d6acce7](https://github.com/zaxbysauce/opencode-swarm/commit/d6acce7dd3fe559e74fc0abde479f39e4678be8f))


### Bug Fixes

* add {{AGENT_PREFIX}} to remaining bare architect reference in FOR tag example ([6545fe0](https://github.com/zaxbysauce/opencode-swarm/commit/6545fe080cd302d5a189aff9439e68e71964863b))
* add handoff command, run memory service, and context budget guard ([efa334c](https://github.com/zaxbysauce/opencode-swarm/commit/efa334cd2e6435eda93176f3f3325a6e1d21d895))
* add handoff command, run memory, and context budget guard ([1118edb](https://github.com/zaxbysauce/opencode-swarm/commit/1118edbac57535eb83552251adb8eddffc264cca))
* **agents:** align prompt contracts with audit intent ([1999097](https://github.com/zaxbysauce/opencode-swarm/commit/19990975925bf61facb448b0b24472e09df870f4))
* **agents:** escape backticks in coder and docs template literals ([2f4faf4](https://github.com/zaxbysauce/opencode-swarm/commit/2f4faf4f8522f77c9d84ea83aca52c5d176bfeac))
* align agent prompt contracts and tests ([c5a906e](https://github.com/zaxbysauce/opencode-swarm/commit/c5a906e9c33d3e4a37aa4f515a55ee14e6cfea4f))
* align gate evidence fixes with tracked dist output ([cb1405a](https://github.com/zaxbysauce/opencode-swarm/commit/cb1405ade97705b86a1664ea019502760507ad3e))
* align prompt drift contracts and tests ([3d94e0f](https://github.com/zaxbysauce/opencode-swarm/commit/3d94e0fce3fc3e2b8668a48ab190f6012ef9faca))
* align tests with wired detectors and hardened interactive safety gates ([5c9701e](https://github.com/zaxbysauce/opencode-swarm/commit/5c9701e8793bd0d807be27d2623c155851dd67ab))
* **architect:** tier QA gates to reduce low-risk churn ([5e38b05](https://github.com/zaxbysauce/opencode-swarm/commit/5e38b05a492c72b823abf17874a155c9d74618aa))
* **build:** remove misplaced src test artifact breaking declarations ([3bee31e](https://github.com/zaxbysauce/opencode-swarm/commit/3bee31ea841b6af5773478f2c514892666be10bb))
* centralize regex safety with escapeRegex/simpleGlobToRegex utilities ([2139031](https://github.com/zaxbysauce/opencode-swarm/commit/2139031404d2573d92b631408df5be66042d488b))
* centralize regex safety with escapeRegex/simpleGlobToRegex utilities ([efd034d](https://github.com/zaxbysauce/opencode-swarm/commit/efd034dd13eada386e15a3d259a37fa4269ec235))
* **ci:** remove native tree-sitter devDeps that compiled from source on Windows ([9138137](https://github.com/zaxbysauce/opencode-swarm/commit/9138137309f81ae2ac4c2287f7da436d4f5446a7))
* clean up remaining workflow tech debt ([5b8cabc](https://github.com/zaxbysauce/opencode-swarm/commit/5b8cabc5f605d5764ca3faff27066a028f173f72))
* clean up remaining workflow tech debt ([e052c3d](https://github.com/zaxbysauce/opencode-swarm/commit/e052c3d51f121202b45350dd7c43ecd6dd35761b))
* code review group A — JSON safety, regex escaping, directory threading ([590df9a](https://github.com/zaxbysauce/opencode-swarm/commit/590df9a4ca8bb0811ea0396691b4cb28a9598e57))
* complete remaining workflow reliability hotfixes ([a88d0a8](https://github.com/zaxbysauce/opencode-swarm/commit/a88d0a8970663bc3e787f9cd04098dd06d91197c))
* complete remaining workflow reliability hotfixes ([d76fa58](https://github.com/zaxbysauce/opencode-swarm/commit/d76fa586bd5c846a4d823ce3d2999edaaa78f225))
* correct broken anchor in docs/configuration.md ([40daacc](https://github.com/zaxbysauce/opencode-swarm/commit/40daaccd0a63ab81d876613e07a9c26f84af0b60))
* correct broken anchor in docs/configuration.md to #configuration-reference ([169b4c7](https://github.com/zaxbysauce/opencode-swarm/commit/169b4c756e50d1d794e44de92cdd7d4a7183bff3))
* delegation-gate fallback evidence writes use process.cwd() instead of directory ([b163737](https://github.com/zaxbysauce/opencode-swarm/commit/b16373712cefa323c760aa0d368d3c44dc519af2))
* **dist:** rebuild dist after lint fixes ([fb5be58](https://github.com/zaxbysauce/opencode-swarm/commit/fb5be5821387815798f99744a35cc0cfc168b4e8))
* **dist:** rebuild dist artifacts for cwd fixes and delegation-gate additions ([6ed7a5b](https://github.com/zaxbysauce/opencode-swarm/commit/6ed7a5b9169f0130997bac6cbcf90a48c4064cbd))
* **dist:** rebuild dist artifacts for update_task_status and write_retro tool additions ([03eb93a](https://github.com/zaxbysauce/opencode-swarm/commit/03eb93ac5bb5ef096bcb3a339cfb3351358abb27))
* eliminate rehydration race and evidence/snapshot merge conflict ([#225](https://github.com/zaxbysauce/opencode-swarm/issues/225)) ([92a1cf4](https://github.com/zaxbysauce/opencode-swarm/commit/92a1cf40fcb3e59528271704f82b2d082b29e53b))
* expose update_task_status and write_retro tools, repair retro compatibility ([ec96421](https://github.com/zaxbysauce/opencode-swarm/commit/ec964215369bae5226e2c0cbb0abf46fce37e485))
* gate warn() behind DEBUG and block direct plan.md writes ([4763f25](https://github.com/zaxbysauce/opencode-swarm/commit/4763f25f29405930b2fe91ecfe7e6f44dc7f98f9))
* gate warn() behind DEBUG and block direct plan.md writes ([36897b1](https://github.com/zaxbysauce/opencode-swarm/commit/36897b1236994a2ac0013b299679ee787606114e))
* harden evidence guard — case-insensitive, length-bound, double-slash safe ([3873a21](https://github.com/zaxbysauce/opencode-swarm/commit/3873a21f17783462014099e311a92bd82159713f))
* harden interactive test runner safety gates ([0a1e66e](https://github.com/zaxbysauce/opencode-swarm/commit/0a1e66e232a6895cc8dc3d49fa811c9588d5c731))
* harden interactive test runner safety gates ([3b489f4](https://github.com/zaxbysauce/opencode-swarm/commit/3b489f46e248bcc4dccd78cf6d62395a63a34718))
* harden JSON.parse, escape regex injection, thread directory into pipeline-tracker ([20b1163](https://github.com/zaxbysauce/opencode-swarm/commit/20b1163f1ca0925ef53aec65018545b7af9d2974))
* harden phase_complete agent aggregation and warnings ([cd5b202](https://github.com/zaxbysauce/opencode-swarm/commit/cd5b20257addf7019226764358810a6a10fdf73e))
* harden pre_check_batch, diff, glob, placeholder-scan, and sast-scan ([11c40f5](https://github.com/zaxbysauce/opencode-swarm/commit/11c40f5a1d4886a9c88c2403b563a74c6a5a8dda))
* honor qa_gates reviewer override in catastrophic phase checks ([17d2e79](https://github.com/zaxbysauce/opencode-swarm/commit/17d2e793dd9e62736d2b2d9c7697fa7eb6c79626))
* honor reviewer qa override in catastrophic checks ([c46b3da](https://github.com/zaxbysauce/opencode-swarm/commit/c46b3daa853049a6d2f0c3128e36e28c6fda0a6f))
* **hotfix-78:** summarization verification, gate-state wiring, and plan-state guard hardening ([1bc62e8](https://github.com/zaxbysauce/opencode-swarm/commit/1bc62e8993c2307e35bcd00dc836e531f044de63))
* **hotfix-78:** summarization verification, gate-state wiring, and plan-state guard hardening ([a42f4f1](https://github.com/zaxbysauce/opencode-swarm/commit/a42f4f1298b04518f1be8d7ca23825f201b518b7))
* implement issues [#145](https://github.com/zaxbysauce/opencode-swarm/issues/145) and [#146](https://github.com/zaxbysauce/opencode-swarm/issues/146) task/phase status handling ([e62749e](https://github.com/zaxbysauce/opencode-swarm/commit/e62749e8739faacbd66f935a83f609c4f6436649))
* **issue-124:** checkReviewerGate skips corrupt sessions; fix mock leakage in phase-monitor tests ([dc1da81](https://github.com/zaxbysauce/opencode-swarm/commit/dc1da8126aa4b3f53f528330404b48a3f728c68f))
* language-agnostic portability for incremental-verify and slop-detector hooks (v6.29.2) ([#216](https://github.com/zaxbysauce/opencode-swarm/issues/216)) ([d2e5335](https://github.com/zaxbysauce/opencode-swarm/commit/d2e5335fe211d19236dcc854d2ff13570c8ca567))
* **lint:** remove CI-blocking biome errors in hooks ([3e8fe80](https://github.com/zaxbysauce/opencode-swarm/commit/3e8fe80bad25c2c4df6758c98798b7b4ac45ebe7))
* **lint:** replace control character regex literal with RegExp constructor to fix noControlCharactersInRegex CI error ([0673429](https://github.com/zaxbysauce/opencode-swarm/commit/0673429f3247dfee94f4e0a8c7194bc06264ced1))
* **lint:** resolve 5 biome errors introduced by Phase 1-4 hardening ([9dacdf3](https://github.com/zaxbysauce/opencode-swarm/commit/9dacdf360db80c4fb0e4bfd4e42d6dbde6ceb701))
* **lint:** resolve biome lint errors to unblock CI ([1aefafb](https://github.com/zaxbysauce/opencode-swarm/commit/1aefafb7ef46dbc84cd23c028fac6591a31c1fa0))
* move violation warnings to system messages and suppress repeated self-coding alerts ([e1d55b9](https://github.com/zaxbysauce/opencode-swarm/commit/e1d55b9303c7fd6e12b8f1d8ad46ef26aa51a50b))
* normalize bare agent name references in prompts to use {{AGENT_PREFIX}} ([efeb4bf](https://github.com/zaxbysauce/opencode-swarm/commit/efeb4bf099409151fa80ccadf1f319ceb8ce1eea))
* normalize prefixed agent names in isAgentDelegation to unblock QA gates for non-default swarms ([4ec0fc6](https://github.com/zaxbysauce/opencode-swarm/commit/4ec0fc6cd24cdca2ae32472ddec132e2b4c0263d))
* normalize subagent_type with stripKnownSwarmPrefix in isAgentDelegation to support prefixed agents like mega_reviewer/mega_test_engineer ([44eb706](https://github.com/zaxbysauce/opencode-swarm/commit/44eb706aa48107d86f3c2ec1d63a12d52d75ca9f))
* normalize task handoff and clarify architect setup ([c4c5cbb](https://github.com/zaxbysauce/opencode-swarm/commit/c4c5cbb8f127008823471055df9749cee9a202c3))
* normalize task tool name for architect handoff ([c832728](https://github.com/zaxbysauce/opencode-swarm/commit/c832728e533854d7da7e615692254e92913f4a6b))
* pass explicit directories to delegation gate tests ([3a798d4](https://github.com/zaxbysauce/opencode-swarm/commit/3a798d477f8d7f4fd2674867e1f6aca2e61ee203))
* pass explicit directories to delegation gate tests ([6d722bb](https://github.com/zaxbysauce/opencode-swarm/commit/6d722bb5c79a837a77ed4025a48b7a9c8343e121))
* persist phaseAgentsDispatched across session restarts for phase_complete ([9b8d53e](https://github.com/zaxbysauce/opencode-swarm/commit/9b8d53ead540dacad19b2edccf6b41b4276f2926))
* persist phaseAgentsDispatched across session restarts for phase_complete ([bb1e068](https://github.com/zaxbysauce/opencode-swarm/commit/bb1e0688116fea45068f217da127c3ff8ed8e0d8))
* persist taskWorkflowStates in session snapshots and reconcile states from plan (Issue [#81](https://github.com/zaxbysauce/opencode-swarm/issues/81)) ([d5c3637](https://github.com/zaxbysauce/opencode-swarm/commit/d5c36376dee5d0db5bf19d6047f3bad346f086dd))
* phase completion reliability and workspace validation hardening ([4051d14](https://github.com/zaxbysauce/opencode-swarm/commit/4051d14b71d5f5cce5b8f479c534eac8817d436a))
* phase completion reliability and workspace validation hardening ([600e9bb](https://github.com/zaxbysauce/opencode-swarm/commit/600e9bb158e98f30e375ce784271f561492bcf98))
* phase_complete updates plan.json on success and adds completed-task fallback for agent requirements ([07c001d](https://github.com/zaxbysauce/opencode-swarm/commit/07c001d470152de7743ebd4bd8dc1d3f99af645b))
* phase_complete updates plan.json on success and adds completed-task fallback for agent requirements ([14888eb](https://github.com/zaxbysauce/opencode-swarm/commit/14888ebfc54d734e6f35ee114ae6b8efedc76401))
* plumb ToolContext.sessionID into phase_complete to fix cross-session tracking ([be22929](https://github.com/zaxbysauce/opencode-swarm/commit/be22929273309b22876e6d612263bb007ebce4d3))
* plumb ToolContext.sessionID into phase_complete to fix cross-session tracking ([e7f898e](https://github.com/zaxbysauce/opencode-swarm/commit/e7f898e1f43cbd83f20b9511a9afec88489dda26)), closes [#89](https://github.com/zaxbysauce/opencode-swarm/issues/89)
* prefer local node_modules/.bin over global npx for linter detection ([#209](https://github.com/zaxbysauce/opencode-swarm/issues/209)) ([9799dca](https://github.com/zaxbysauce/opencode-swarm/commit/9799dcae85ac0549b88efa7ab79fbf3300451b18))
* read subagent_type from input.args in tool.execute.after hook ([87a0b1f](https://github.com/zaxbysauce/opencode-swarm/commit/87a0b1f406a2db367e5c04783534be812f11c62a))
* read subagent_type from input.args in tool.execute.after hook ([045c69d](https://github.com/zaxbysauce/opencode-swarm/commit/045c69d5ed2c7046963b25f2a1f28fd57f452803))
* reconcile evidence handling and contain test scope ([cea26ec](https://github.com/zaxbysauce/opencode-swarm/commit/cea26ec1aa5754d5a8b213d4c13a05fd658978b7))
* reconcile evidence handling and contain test scope ([8ebf15a](https://github.com/zaxbysauce/opencode-swarm/commit/8ebf15a4e84685feda136dce66421c9c6076683a))
* record explorer and sme gate evidence ([f3e60de](https://github.com/zaxbysauce/opencode-swarm/commit/f3e60de2a096450d6302b2a19a68180b8a500c08))
* record explorer and sme gate evidence ([833cced](https://github.com/zaxbysauce/opencode-swarm/commit/833cced7a61a1fb5cba004a8cbcef1dbff4b4c81))
* recover task state from delegation chains before gate check ([a6e3574](https://github.com/zaxbysauce/opencode-swarm/commit/a6e3574048996b4b60aa285692ddb064bfb76390))
* regression sweep gate, test task dedup, gated full-suite, and curator wiring ([#220](https://github.com/zaxbysauce/opencode-swarm/issues/220)) ([6dc331d](https://github.com/zaxbysauce/opencode-swarm/commit/6dc331d63ad3dba7387510db5f6c89ec50f0fad5))
* **release:** realign release-please baseline to v6.19.0 ([02c505a](https://github.com/zaxbysauce/opencode-swarm/commit/02c505a0aa73aca0c9a96c288f04dc6d3cbdedf2))
* remove debug console.log, fix advanceTaskState guard, move batch warnings to system messages ([8f38933](https://github.com/zaxbysauce/opencode-swarm/commit/8f38933575b4ae809e9aa15477b55aa20df860cd))
* remove platform guard from Windows device path check in declare-scope ([10f1b1f](https://github.com/zaxbysauce/opencode-swarm/commit/10f1b1f71f0efb149cf0ed54948288fb46170cbb))
* remove platform guard from Windows device path check in declare-scope ([8aef2c6](https://github.com/zaxbysauce/opencode-swarm/commit/8aef2c6e5379f02a121664e6c2a01ebd4f054377))
* remove redundant reconcileTaskStatesFromPlan causing startup throw-loop in v6.29.6 ([#227](https://github.com/zaxbysauce/opencode-swarm/issues/227)) ([f6ddf69](https://github.com/zaxbysauce/opencode-swarm/commit/f6ddf6906de614769956c6b87ed51f224dbefc1b))
* replace bare reviewer/test_engineer agent name references with {{AGENT_PREFIX}} in architect prompt ([e34fdab](https://github.com/zaxbysauce/opencode-swarm/commit/e34fdab4719289bb6e9731ea532de2394a707852))
* resolve .swarm output dir against project root in sbom_generate ([af49bd5](https://github.com/zaxbysauce/opencode-swarm/commit/af49bd5c4cbaeef8700c2aa5783fdad02409c86d))
* resolve .swarm output directory against project root in sbom-generate ([4e5a210](https://github.com/zaxbysauce/opencode-swarm/commit/4e5a210185577f46d65177f05de31f84069e75f4))
* resolve 26 test failures from knowledge system audit ([5bda121](https://github.com/zaxbysauce/opencode-swarm/commit/5bda12182a1210de2f4b9c8c796c728d50f7d9e6))
* resolve all 26 test failures in knowledge system audit ([ae49bc0](https://github.com/zaxbysauce/opencode-swarm/commit/ae49bc04f4bf219275c4801bfb92dccd07eaf962))
* resolve all biome lint errors to restore CI green ([2b19afc](https://github.com/zaxbysauce/opencode-swarm/commit/2b19afcbc1e8b1c8628a50ba6bd89a328b2150a5))
* resolve biome lint errors in regex utility and phase-complete ([bc2a2ac](https://github.com/zaxbysauce/opencode-swarm/commit/bc2a2acfb555e7bf16a0f8072a6cac71fde2295d))
* resolve CI typecheck failure — scope afterCoder in delegation-gate ([1f1c6bf](https://github.com/zaxbysauce/opencode-swarm/commit/1f1c6bf028a30be039bc2ec6f8b4c48b2c080ade))
* resolve path before isSourceCodePath check, fix test gate setup ([d16df29](https://github.com/zaxbysauce/opencode-swarm/commit/d16df2936a0cdc63713ada655c5189d92d368157))
* resolve path before isSourceCodePath check, fix test gate setup ([d498cc0](https://github.com/zaxbysauce/opencode-swarm/commit/d498cc0c171fb19796dadc8cea482824540829d5))
* resolve phase_complete fallback regressions affecting task status flow ([f908425](https://github.com/zaxbysauce/opencode-swarm/commit/f908425906e02c8d2fa8378fad8ec14e97a1091a))
* resolve TypeScript CI failures ([e752163](https://github.com/zaxbysauce/opencode-swarm/commit/e75216340ceeb42374a5f628c3370cd1d277a39b))
* resolve v6.29.4 startup regression in knowledge-injector and pha… ([#223](https://github.com/zaxbysauce/opencode-swarm/issues/223)) ([03c16bc](https://github.com/zaxbysauce/opencode-swarm/commit/03c16bcdf5e30179eda20eef403426dc18be7026))
* restore architect delegation and add gate status tool ([2223d95](https://github.com/zaxbysauce/opencode-swarm/commit/2223d954b635c769e3e1ecf3ba35f78b16f04a8e))
* restore architect delegation and add gate status tool ([ef8bcb2](https://github.com/zaxbysauce/opencode-swarm/commit/ef8bcb2e1d1ade91b704f1ba26779ac557de714f))
* restore architect delegation and add gate status tool ([8a655ea](https://github.com/zaxbysauce/opencode-swarm/commit/8a655ea7328da6acfd617b5b690000e182666604))
* restore delegation-gate task advancement after task calls ([04c5212](https://github.com/zaxbysauce/opencode-swarm/commit/04c521267daf9fd2bcabcdc7d6a7017d3738d860))
* restore delegation-gate task advancement after task calls ([8894427](https://github.com/zaxbysauce/opencode-swarm/commit/8894427e230d742d3b895a70ead027c4b53d1348))
* restore evidence compatibility and stale workflow expectation ([f91e69e](https://github.com/zaxbysauce/opencode-swarm/commit/f91e69eb1e49b53406699b0b936c023bac84b64a))
* restore evidence compatibility and stale workflow expectation ([2d91300](https://github.com/zaxbysauce/opencode-swarm/commit/2d91300ea733f5c04ae0281c40f7d27a72e116fb))
* restore evidence ID compatibility ([7c71e9a](https://github.com/zaxbysauce/opencode-swarm/commit/7c71e9acf5f6c0871262c0088bf792af7bccdc45))
* restore release-please trigger after non-conventional merge ([00302b3](https://github.com/zaxbysauce/opencode-swarm/commit/00302b34deef33b536de547df726094e1fc9fc5d))
* restore release-please trigger with conventional commit guidance ([4caa55b](https://github.com/zaxbysauce/opencode-swarm/commit/4caa55b7ba489bf73d67e9996a1722582f4f1f06))
* revert monorepo config, broaden evidence guardrail, prefer directArgs task_id, relax task granularity ([#208](https://github.com/zaxbysauce/opencode-swarm/issues/208)) ([c9b8e9a](https://github.com/zaxbysauce/opencode-swarm/commit/c9b8e9a78da54b24f8742a0e67104cee4cb32e15))
* route advisory hook messages into LLM context via pendingAdvisoryMessages queue ([#214](https://github.com/zaxbysauce/opencode-swarm/issues/214)) ([48fcb0d](https://github.com/zaxbysauce/opencode-swarm/commit/48fcb0d75310e4978c632c2141161faac8b8541d))
* seed task workflow state in new sessions during cross-session propagation ([1b49604](https://github.com/zaxbysauce/opencode-swarm/commit/1b496042b581634adc53a0bcbaf7b4e9e99a4cee))
* seed task workflow state in new sessions during cross-session propagation ([2c51514](https://github.com/zaxbysauce/opencode-swarm/commit/2c5151477866411e0dfb461b71d234a50d893f15))
* silent catch blocks in delegation-gate now log warnings; gate heuristic checks on coder delegation; fix [ ] sanitization ([b28dae1](https://github.com/zaxbysauce/opencode-swarm/commit/b28dae1e860a0f25b44181b0019aaae59b7169fe))
* state machine never advances on default config and CLI writes wrong config file ([#81](https://github.com/zaxbysauce/opencode-swarm/issues/81) [#84](https://github.com/zaxbysauce/opencode-swarm/issues/84)) ([ac8dffa](https://github.com/zaxbysauce/opencode-swarm/commit/ac8dffaaf6fb7c94675fa22621125cc420c20c57))
* state machine never advances on default config and CLI writes wrong config file ([#81](https://github.com/zaxbysauce/opencode-swarm/issues/81) [#84](https://github.com/zaxbysauce/opencode-swarm/issues/84)) ([9023b40](https://github.com/zaxbysauce/opencode-swarm/commit/9023b406527469672c644bb39610dae1e4fcd8e7))
* suppress repeated violation warnings and route all guardrail guidance to system messages ([9500d72](https://github.com/zaxbysauce/opencode-swarm/commit/9500d729353984d8732cb6f029216ec4fe626f38))
* surface Curator status in diagnose and docs ([#218](https://github.com/zaxbysauce/opencode-swarm/issues/218)) ([7729ffe](https://github.com/zaxbysauce/opencode-swarm/commit/7729ffecf14637d8c3cf5a56f139208c630e620e))
* sync active task identity for durable evidence ([f2f7291](https://github.com/zaxbysauce/opencode-swarm/commit/f2f729195b66bdaa0fedf200c0d45dc6078b953c))
* sync active task identity for durable evidence ([058e036](https://github.com/zaxbysauce/opencode-swarm/commit/058e0366769a85ac27a1d29596ca23ca9838afc6))
* test isolation - use DI for curator runner, loosen drift path traversal assertion ([e334e7d](https://github.com/zaxbysauce/opencode-swarm/commit/e334e7d461ad322b13d03765bf5c9531981b70c5))
* **tests:** always write explicit curator config in test helper to prevent user config leak ([d0543f4](https://github.com/zaxbysauce/opencode-swarm/commit/d0543f457488d59e42cdbd7dc6aa6562584603f2))
* **tests:** always write explicit curator config to prevent user config leak ([1e6a571](https://github.com/zaxbysauce/opencode-swarm/commit/1e6a571a009b3cd82d1ecb31a1c29b8024842e5b))
* **tests:** correct phase_complete adversarial test expectations for RETROSPECTIVE_MISSING behavior ([bc0383f](https://github.com/zaxbysauce/opencode-swarm/commit/bc0383ff14577e4f4fd18152d001c6c41c5500bf))
* **tests:** replace .resolves.not.toThrow() with Bun-compatible await pattern ([dd31ca5](https://github.com/zaxbysauce/opencode-swarm/commit/dd31ca5ee5b45489ef9ab0f09380a601d9dd737c))
* **tests:** replace .resolves.not.toThrow() with Bun-compatible await pattern ([d98173d](https://github.com/zaxbysauce/opencode-swarm/commit/d98173d99892f390b68e4cdae98bd7fbdac1cac7))
* tool hardening and Windows CI native-dep removal ([e6155e0](https://github.com/zaxbysauce/opencode-swarm/commit/e6155e09bed9705c1970c6b0d61b16ef6b24d804))
* tool-based task gate evidence store (Issue [#146](https://github.com/zaxbysauce/opencode-swarm/issues/146)) ([c2a34c2](https://github.com/zaxbysauce/opencode-swarm/commit/c2a34c213afdb67067656b91354bae62d4eda57e))
* tool-based task gate evidence store (Issues [#146](https://github.com/zaxbysauce/opencode-swarm/issues/146), [#145](https://github.com/zaxbysauce/opencode-swarm/issues/145)) ([37cedaf](https://github.com/zaxbysauce/opencode-swarm/commit/37cedafc091ab9839ad222f6d4c52031829b0f92))
* **tools:** expose update_task_status and write_retro, repair retro compatibility, harden architect prompt ([694dd16](https://github.com/zaxbysauce/opencode-swarm/commit/694dd1656bd34dc5ffbfac71c0587bd898c6b9a0))
* update test expectations to match wired detectors and hardened safety guards ([6f50f6e](https://github.com/zaxbysauce/opencode-swarm/commit/6f50f6e3246c2a5555ee65e74ec757f1da0b600b))
* use directory instead of process.cwd() in delegation-gate fallback evidence path ([3aef904](https://github.com/zaxbysauce/opencode-swarm/commit/3aef904459c470bbfe30c6e873ef03a50b3474cf))
* use dynamic agent prefix in system-enhancer injected prompt text ([1873088](https://github.com/zaxbysauce/opencode-swarm/commit/187308862fc99897e8515e786e332e63baaf7d94))
* use workspace directory as cwd for all subprocess calls ([5e24335](https://github.com/zaxbysauce/opencode-swarm/commit/5e243354e3f7828c7537e9d69b4e65261025173e))
* use workspace directory as cwd for all subprocess calls ([3d855b6](https://github.com/zaxbysauce/opencode-swarm/commit/3d855b6f012c49543b86a40509cb749de63cbfcb))
* widen gate recovery scan for pure-verification and code-organization tasks ([865a8cf](https://github.com/zaxbysauce/opencode-swarm/commit/865a8cfa33d4b610d2b0da79cab10460039783b9))


### Reverts

* undo direct push of architect delegation and gate status hotfix ([326b323](https://github.com/zaxbysauce/opencode-swarm/commit/326b323eab6b60e9c23d5fbf34fb338b72ca0553))

## [6.29.7](https://github.com/zaxbysauce/opencode-swarm/compare/v6.29.6...v6.29.7) (2026-03-20)


### Bug Fixes

* remove redundant reconcileTaskStatesFromPlan causing startup throw-loop in v6.29.6 ([#227](https://github.com/zaxbysauce/opencode-swarm/issues/227)) ([f6ddf69](https://github.com/zaxbysauce/opencode-swarm/commit/f6ddf6906de614769956c6b87ed51f224dbefc1b))

## [6.29.6](https://github.com/zaxbysauce/opencode-swarm/compare/v6.29.5...v6.29.6) (2026-03-20)


### Bug Fixes

* eliminate rehydration race and evidence/snapshot merge conflict ([#225](https://github.com/zaxbysauce/opencode-swarm/issues/225)) ([92a1cf4](https://github.com/zaxbysauce/opencode-swarm/commit/92a1cf40fcb3e59528271704f82b2d082b29e53b))

## [6.29.5](https://github.com/zaxbysauce/opencode-swarm/compare/v6.29.4...v6.29.5) (2026-03-20)


### Bug Fixes

* resolve v6.29.4 startup regression in knowledge-injector and pha… ([#223](https://github.com/zaxbysauce/opencode-swarm/issues/223)) ([03c16bc](https://github.com/zaxbysauce/opencode-swarm/commit/03c16bcdf5e30179eda20eef403426dc18be7026))

## [6.29.4](https://github.com/zaxbysauce/opencode-swarm/compare/v6.29.3...v6.29.4) (2026-03-20)


### Bug Fixes

* regression sweep gate, test task dedup, gated full-suite, and curator wiring ([#220](https://github.com/zaxbysauce/opencode-swarm/issues/220)) ([6dc331d](https://github.com/zaxbysauce/opencode-swarm/commit/6dc331d63ad3dba7387510db5f6c89ec50f0fad5))

## [6.29.3](https://github.com/zaxbysauce/opencode-swarm/compare/v6.29.2...v6.29.3) (2026-03-19)


### Bug Fixes

* surface Curator status in diagnose and docs ([#218](https://github.com/zaxbysauce/opencode-swarm/issues/218)) ([7729ffe](https://github.com/zaxbysauce/opencode-swarm/commit/7729ffecf14637d8c3cf5a56f139208c630e620e))

## [6.29.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.29.1...v6.29.2) (2026-03-19)

### Features

* multi-language incremental-verify with Go/Rust/C#/Python detection, spawnAsync portability, slop-detector hardening, evidence phase_number fix ([#215](https://github.com/zaxbysauce/opencode-swarm/issues/215)) ([4f59ac4](https://github.com/zaxbysauce/opencode-swarm/commit/4f59ac4a1fc4ec5df7d81f15c0ba1c93d7c5b3f8))

### Bug Fixes

* evidence-schema phase_number minimum from 0 to 1 — Phase 0 never valid ([4f59ac4](https://github.com/zaxbysauce/opencode-swarm/commit/4f59ac4a1fc4ec5df7d81f15c0ba1c93d7c5b3f8))
* language-agnostic portability for incremental-verify and slop-detector hooks (v6.29.2) ([#216](https://github.com/zaxbysauce/opencode-swarm/issues/216)) ([d2e5335](https://github.com/zaxbysauce/opencode-swarm/commit/d2e5335fe211d19236dcc854d2ff13570c8ca567))

## [6.29.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.29.0...v6.29.1) (2026-03-19)


### Bug Fixes

* route advisory hook messages into LLM context via pendingAdvisoryMessages queue ([#214](https://github.com/zaxbysauce/opencode-swarm/issues/214)) ([48fcb0d](https://github.com/zaxbysauce/opencode-swarm/commit/48fcb0d75310e4978c632c2141161faac8b8541d))

## [6.29.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.28.1...v6.29.0) (2026-03-19)


### Features

* self-correcting workflow hooks, context compaction, and tech debt cleanup ([#212](https://github.com/zaxbysauce/opencode-swarm/issues/212)) ([8fd18c9](https://github.com/zaxbysauce/opencode-swarm/commit/8fd18c9f69d7d37016bab300814f825784db3f1a))

## [6.28.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.28.0...v6.28.1) (2026-03-18)


### Bug Fixes

* prefer local node_modules/.bin over global npx for linter detection ([#209](https://github.com/zaxbysauce/opencode-swarm/issues/209)) ([9799dca](https://github.com/zaxbysauce/opencode-swarm/commit/9799dcae85ac0549b88efa7ab79fbf3300451b18))

## [6.28.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.27.1...v6.28.0) (2026-03-17)


### Features

* add next pre-release pipeline for v7.0 beta testing ([a35ebb4](https://github.com/zaxbysauce/opencode-swarm/commit/a35ebb477acd08baadf19437995a97aafbaf93f9))


### Bug Fixes

* harden evidence guard — case-insensitive, length-bound, double-slash safe ([3873a21](https://github.com/zaxbysauce/opencode-swarm/commit/3873a21f17783462014099e311a92bd82159713f))
* revert monorepo config, broaden evidence guardrail, prefer directArgs task_id, relax task granularity ([#208](https://github.com/zaxbysauce/opencode-swarm/issues/208)) ([c9b8e9a](https://github.com/zaxbysauce/opencode-swarm/commit/c9b8e9a78da54b24f8742a0e67104cee4cb32e15))

## [6.27.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.27.0...v6.27.1) (2026-03-15)


### Bug Fixes

* widen gate recovery scan for pure-verification and code-organization tasks ([865a8cf](https://github.com/zaxbysauce/opencode-swarm/commit/865a8cfa33d4b610d2b0da79cab10460039783b9))

## [6.27.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.26.0...v6.27.0) (2026-03-14)


### Features

* add Curator background analysis system with phase-level drift detection and knowledge injection ([8cf8d07](https://github.com/zaxbysauce/opencode-swarm/commit/8cf8d07ed8383948288fed53b31c6c0d0f8dfc91))
* **agents:** add defensive coding rules and error handling to coder (C1, C2, X3, X4) ([cbb2220](https://github.com/zaxbysauce/opencode-swarm/commit/cbb22202ecd289b824335abb6d99aacc66ffa87c))
* **agents:** add differential review focus and structured reasoning to reviewer (R1, R2, X3, X4) ([45e9069](https://github.com/zaxbysauce/opencode-swarm/commit/45e9069f90609787d36a7e089e7f3b5a1dd8cde2))
* **agents:** add documentation scope rules to docs (D1, X3, X4) ([e39d22b](https://github.com/zaxbysauce/opencode-swarm/commit/e39d22b9a16e57289a08b3288f5e8f573453f738))
* **agents:** add research protocol and confidence calibration to sme (S1, X3, X4) ([b1f250d](https://github.com/zaxbysauce/opencode-swarm/commit/b1f250d00ba31f20d9265a2a0dad2f9c949c5d3c))
* **agents:** add structured codebase analysis protocol to explorer (E1, X3, X4) ([b2d346c](https://github.com/zaxbysauce/opencode-swarm/commit/b2d346c8867a62e891d63d54768be29bba6a0b31))
* **agents:** complete audit phase 4-6 — remaining 13 deferred items ([d4001fa](https://github.com/zaxbysauce/opencode-swarm/commit/d4001fa0e07d94f429e59a3003078826bc052c66))
* **agents:** complete audit phase 4-6 — remaining 13 deferred items ([d60f3e2](https://github.com/zaxbysauce/opencode-swarm/commit/d60f3e2e0b176c52a8182b1c09d0ae66abdd8ce9))
* **agents:** overhaul test-engineer prompt (T1-T4, X3, X4) ([b830f91](https://github.com/zaxbysauce/opencode-swarm/commit/b830f91ae2b82833607274227484b42977ab2293))
* **gate-enforcement:** add per-task state machine, scope declaration, and hard blocks ([a1ab8ad](https://github.com/zaxbysauce/opencode-swarm/commit/a1ab8adb8378b3402c97184328e61442fd80774f))
* **gate-enforcement:** per-task state machine, scope declaration, and hard blocks (v6.21) ([90324cf](https://github.com/zaxbysauce/opencode-swarm/commit/90324cf53a88a7ad0132f9d8786b084d3e95e035))
* implement glob/path exclude patterns and .secretscanignore support for secretscan ([4271898](https://github.com/zaxbysauce/opencode-swarm/commit/42718983db6f6bed160990a52c0906c3ac886da3))
* implement session durability and Turbo Mode controls (v6.26) ([a87eb95](https://github.com/zaxbysauce/opencode-swarm/commit/a87eb95065985e82f9a158e24cd64dc6dc2902df))
* **secretscan:** glob/path exclude patterns and .secretscanignore support ([4a3a91a](https://github.com/zaxbysauce/opencode-swarm/commit/4a3a91a613710a599831b1f159bf62ece963c957))
* session durability and Turbo Mode controls (v6.26) ([9d7eb32](https://github.com/zaxbysauce/opencode-swarm/commit/9d7eb32f0a69c06e5566d75c4620c023d7a71cfd))
* v6.19.0 — Prompt-Quality & Adversarial Robustness Update ([0fdf2e8](https://github.com/zaxbysauce/opencode-swarm/commit/0fdf2e818846a0f2c66b8ff42cd650b8d923f0c1))
* **v6.20:** add AST diffing, parallelism framework, PR gate, checkpoint extension, agent output, skill versioning, and context efficiency ([f13ea28](https://github.com/zaxbysauce/opencode-swarm/commit/f13ea285cb862dc0e5dae5e641b560bd5c0ffac5))
* **v6.20:** AST diffing, parallelism framework, PR gate, checkpoint extension, agent output, skill versioning ([d6acce7](https://github.com/zaxbysauce/opencode-swarm/commit/d6acce7dd3fe559e74fc0abde479f39e4678be8f))


### Bug Fixes

* add {{AGENT_PREFIX}} to remaining bare architect reference in FOR tag example ([6545fe0](https://github.com/zaxbysauce/opencode-swarm/commit/6545fe080cd302d5a189aff9439e68e71964863b))
* add handoff command, run memory service, and context budget guard ([efa334c](https://github.com/zaxbysauce/opencode-swarm/commit/efa334cd2e6435eda93176f3f3325a6e1d21d895))
* add handoff command, run memory, and context budget guard ([1118edb](https://github.com/zaxbysauce/opencode-swarm/commit/1118edbac57535eb83552251adb8eddffc264cca))
* **agents:** align prompt contracts with audit intent ([1999097](https://github.com/zaxbysauce/opencode-swarm/commit/19990975925bf61facb448b0b24472e09df870f4))
* **agents:** escape backticks in coder and docs template literals ([2f4faf4](https://github.com/zaxbysauce/opencode-swarm/commit/2f4faf4f8522f77c9d84ea83aca52c5d176bfeac))
* align agent prompt contracts and tests ([c5a906e](https://github.com/zaxbysauce/opencode-swarm/commit/c5a906e9c33d3e4a37aa4f515a55ee14e6cfea4f))
* align gate evidence fixes with tracked dist output ([cb1405a](https://github.com/zaxbysauce/opencode-swarm/commit/cb1405ade97705b86a1664ea019502760507ad3e))
* align prompt drift contracts and tests ([3d94e0f](https://github.com/zaxbysauce/opencode-swarm/commit/3d94e0fce3fc3e2b8668a48ab190f6012ef9faca))
* align tests with wired detectors and hardened interactive safety gates ([5c9701e](https://github.com/zaxbysauce/opencode-swarm/commit/5c9701e8793bd0d807be27d2623c155851dd67ab))
* **architect:** tier QA gates to reduce low-risk churn ([5e38b05](https://github.com/zaxbysauce/opencode-swarm/commit/5e38b05a492c72b823abf17874a155c9d74618aa))
* **build:** remove misplaced src test artifact breaking declarations ([3bee31e](https://github.com/zaxbysauce/opencode-swarm/commit/3bee31ea841b6af5773478f2c514892666be10bb))
* centralize regex safety with escapeRegex/simpleGlobToRegex utilities ([2139031](https://github.com/zaxbysauce/opencode-swarm/commit/2139031404d2573d92b631408df5be66042d488b))
* centralize regex safety with escapeRegex/simpleGlobToRegex utilities ([efd034d](https://github.com/zaxbysauce/opencode-swarm/commit/efd034dd13eada386e15a3d259a37fa4269ec235))
* **ci:** remove native tree-sitter devDeps that compiled from source on Windows ([9138137](https://github.com/zaxbysauce/opencode-swarm/commit/9138137309f81ae2ac4c2287f7da436d4f5446a7))
* clean up remaining workflow tech debt ([5b8cabc](https://github.com/zaxbysauce/opencode-swarm/commit/5b8cabc5f605d5764ca3faff27066a028f173f72))
* clean up remaining workflow tech debt ([e052c3d](https://github.com/zaxbysauce/opencode-swarm/commit/e052c3d51f121202b45350dd7c43ecd6dd35761b))
* code review group A — JSON safety, regex escaping, directory threading ([590df9a](https://github.com/zaxbysauce/opencode-swarm/commit/590df9a4ca8bb0811ea0396691b4cb28a9598e57))
* complete remaining workflow reliability hotfixes ([a88d0a8](https://github.com/zaxbysauce/opencode-swarm/commit/a88d0a8970663bc3e787f9cd04098dd06d91197c))
* complete remaining workflow reliability hotfixes ([d76fa58](https://github.com/zaxbysauce/opencode-swarm/commit/d76fa586bd5c846a4d823ce3d2999edaaa78f225))
* correct broken anchor in docs/configuration.md ([40daacc](https://github.com/zaxbysauce/opencode-swarm/commit/40daaccd0a63ab81d876613e07a9c26f84af0b60))
* correct broken anchor in docs/configuration.md to #configuration-reference ([169b4c7](https://github.com/zaxbysauce/opencode-swarm/commit/169b4c756e50d1d794e44de92cdd7d4a7183bff3))
* delegation-gate fallback evidence writes use process.cwd() instead of directory ([b163737](https://github.com/zaxbysauce/opencode-swarm/commit/b16373712cefa323c760aa0d368d3c44dc519af2))
* **dist:** rebuild dist after lint fixes ([fb5be58](https://github.com/zaxbysauce/opencode-swarm/commit/fb5be5821387815798f99744a35cc0cfc168b4e8))
* **dist:** rebuild dist artifacts for cwd fixes and delegation-gate additions ([6ed7a5b](https://github.com/zaxbysauce/opencode-swarm/commit/6ed7a5b9169f0130997bac6cbcf90a48c4064cbd))
* **dist:** rebuild dist artifacts for update_task_status and write_retro tool additions ([03eb93a](https://github.com/zaxbysauce/opencode-swarm/commit/03eb93ac5bb5ef096bcb3a339cfb3351358abb27))
* expose update_task_status and write_retro tools, repair retro compatibility ([ec96421](https://github.com/zaxbysauce/opencode-swarm/commit/ec964215369bae5226e2c0cbb0abf46fce37e485))
* gate warn() behind DEBUG and block direct plan.md writes ([4763f25](https://github.com/zaxbysauce/opencode-swarm/commit/4763f25f29405930b2fe91ecfe7e6f44dc7f98f9))
* gate warn() behind DEBUG and block direct plan.md writes ([36897b1](https://github.com/zaxbysauce/opencode-swarm/commit/36897b1236994a2ac0013b299679ee787606114e))
* harden interactive test runner safety gates ([0a1e66e](https://github.com/zaxbysauce/opencode-swarm/commit/0a1e66e232a6895cc8dc3d49fa811c9588d5c731))
* harden interactive test runner safety gates ([3b489f4](https://github.com/zaxbysauce/opencode-swarm/commit/3b489f46e248bcc4dccd78cf6d62395a63a34718))
* harden JSON.parse, escape regex injection, thread directory into pipeline-tracker ([20b1163](https://github.com/zaxbysauce/opencode-swarm/commit/20b1163f1ca0925ef53aec65018545b7af9d2974))
* harden phase_complete agent aggregation and warnings ([cd5b202](https://github.com/zaxbysauce/opencode-swarm/commit/cd5b20257addf7019226764358810a6a10fdf73e))
* harden pre_check_batch, diff, glob, placeholder-scan, and sast-scan ([11c40f5](https://github.com/zaxbysauce/opencode-swarm/commit/11c40f5a1d4886a9c88c2403b563a74c6a5a8dda))
* honor qa_gates reviewer override in catastrophic phase checks ([17d2e79](https://github.com/zaxbysauce/opencode-swarm/commit/17d2e793dd9e62736d2b2d9c7697fa7eb6c79626))
* honor reviewer qa override in catastrophic checks ([c46b3da](https://github.com/zaxbysauce/opencode-swarm/commit/c46b3daa853049a6d2f0c3128e36e28c6fda0a6f))
* **hotfix-78:** summarization verification, gate-state wiring, and plan-state guard hardening ([1bc62e8](https://github.com/zaxbysauce/opencode-swarm/commit/1bc62e8993c2307e35bcd00dc836e531f044de63))
* **hotfix-78:** summarization verification, gate-state wiring, and plan-state guard hardening ([a42f4f1](https://github.com/zaxbysauce/opencode-swarm/commit/a42f4f1298b04518f1be8d7ca23825f201b518b7))
* implement issues [#145](https://github.com/zaxbysauce/opencode-swarm/issues/145) and [#146](https://github.com/zaxbysauce/opencode-swarm/issues/146) task/phase status handling ([e62749e](https://github.com/zaxbysauce/opencode-swarm/commit/e62749e8739faacbd66f935a83f609c4f6436649))
* **issue-124:** checkReviewerGate skips corrupt sessions; fix mock leakage in phase-monitor tests ([dc1da81](https://github.com/zaxbysauce/opencode-swarm/commit/dc1da8126aa4b3f53f528330404b48a3f728c68f))
* **lint:** remove CI-blocking biome errors in hooks ([3e8fe80](https://github.com/zaxbysauce/opencode-swarm/commit/3e8fe80bad25c2c4df6758c98798b7b4ac45ebe7))
* **lint:** replace control character regex literal with RegExp constructor to fix noControlCharactersInRegex CI error ([0673429](https://github.com/zaxbysauce/opencode-swarm/commit/0673429f3247dfee94f4e0a8c7194bc06264ced1))
* **lint:** resolve 5 biome errors introduced by Phase 1-4 hardening ([9dacdf3](https://github.com/zaxbysauce/opencode-swarm/commit/9dacdf360db80c4fb0e4bfd4e42d6dbde6ceb701))
* **lint:** resolve biome lint errors to unblock CI ([1aefafb](https://github.com/zaxbysauce/opencode-swarm/commit/1aefafb7ef46dbc84cd23c028fac6591a31c1fa0))
* move violation warnings to system messages and suppress repeated self-coding alerts ([e1d55b9](https://github.com/zaxbysauce/opencode-swarm/commit/e1d55b9303c7fd6e12b8f1d8ad46ef26aa51a50b))
* normalize bare agent name references in prompts to use {{AGENT_PREFIX}} ([efeb4bf](https://github.com/zaxbysauce/opencode-swarm/commit/efeb4bf099409151fa80ccadf1f319ceb8ce1eea))
* normalize prefixed agent names in isAgentDelegation to unblock QA gates for non-default swarms ([4ec0fc6](https://github.com/zaxbysauce/opencode-swarm/commit/4ec0fc6cd24cdca2ae32472ddec132e2b4c0263d))
* normalize subagent_type with stripKnownSwarmPrefix in isAgentDelegation to support prefixed agents like mega_reviewer/mega_test_engineer ([44eb706](https://github.com/zaxbysauce/opencode-swarm/commit/44eb706aa48107d86f3c2ec1d63a12d52d75ca9f))
* normalize task handoff and clarify architect setup ([c4c5cbb](https://github.com/zaxbysauce/opencode-swarm/commit/c4c5cbb8f127008823471055df9749cee9a202c3))
* normalize task tool name for architect handoff ([c832728](https://github.com/zaxbysauce/opencode-swarm/commit/c832728e533854d7da7e615692254e92913f4a6b))
* pass explicit directories to delegation gate tests ([3a798d4](https://github.com/zaxbysauce/opencode-swarm/commit/3a798d477f8d7f4fd2674867e1f6aca2e61ee203))
* pass explicit directories to delegation gate tests ([6d722bb](https://github.com/zaxbysauce/opencode-swarm/commit/6d722bb5c79a837a77ed4025a48b7a9c8343e121))
* persist phaseAgentsDispatched across session restarts for phase_complete ([9b8d53e](https://github.com/zaxbysauce/opencode-swarm/commit/9b8d53ead540dacad19b2edccf6b41b4276f2926))
* persist phaseAgentsDispatched across session restarts for phase_complete ([bb1e068](https://github.com/zaxbysauce/opencode-swarm/commit/bb1e0688116fea45068f217da127c3ff8ed8e0d8))
* persist taskWorkflowStates in session snapshots and reconcile states from plan (Issue [#81](https://github.com/zaxbysauce/opencode-swarm/issues/81)) ([d5c3637](https://github.com/zaxbysauce/opencode-swarm/commit/d5c36376dee5d0db5bf19d6047f3bad346f086dd))
* phase completion reliability and workspace validation hardening ([4051d14](https://github.com/zaxbysauce/opencode-swarm/commit/4051d14b71d5f5cce5b8f479c534eac8817d436a))
* phase completion reliability and workspace validation hardening ([600e9bb](https://github.com/zaxbysauce/opencode-swarm/commit/600e9bb158e98f30e375ce784271f561492bcf98))
* phase_complete updates plan.json on success and adds completed-task fallback for agent requirements ([07c001d](https://github.com/zaxbysauce/opencode-swarm/commit/07c001d470152de7743ebd4bd8dc1d3f99af645b))
* phase_complete updates plan.json on success and adds completed-task fallback for agent requirements ([14888eb](https://github.com/zaxbysauce/opencode-swarm/commit/14888ebfc54d734e6f35ee114ae6b8efedc76401))
* plumb ToolContext.sessionID into phase_complete to fix cross-session tracking ([be22929](https://github.com/zaxbysauce/opencode-swarm/commit/be22929273309b22876e6d612263bb007ebce4d3))
* plumb ToolContext.sessionID into phase_complete to fix cross-session tracking ([e7f898e](https://github.com/zaxbysauce/opencode-swarm/commit/e7f898e1f43cbd83f20b9511a9afec88489dda26)), closes [#89](https://github.com/zaxbysauce/opencode-swarm/issues/89)
* read subagent_type from input.args in tool.execute.after hook ([87a0b1f](https://github.com/zaxbysauce/opencode-swarm/commit/87a0b1f406a2db367e5c04783534be812f11c62a))
* read subagent_type from input.args in tool.execute.after hook ([045c69d](https://github.com/zaxbysauce/opencode-swarm/commit/045c69d5ed2c7046963b25f2a1f28fd57f452803))
* reconcile evidence handling and contain test scope ([cea26ec](https://github.com/zaxbysauce/opencode-swarm/commit/cea26ec1aa5754d5a8b213d4c13a05fd658978b7))
* reconcile evidence handling and contain test scope ([8ebf15a](https://github.com/zaxbysauce/opencode-swarm/commit/8ebf15a4e84685feda136dce66421c9c6076683a))
* record explorer and sme gate evidence ([f3e60de](https://github.com/zaxbysauce/opencode-swarm/commit/f3e60de2a096450d6302b2a19a68180b8a500c08))
* record explorer and sme gate evidence ([833cced](https://github.com/zaxbysauce/opencode-swarm/commit/833cced7a61a1fb5cba004a8cbcef1dbff4b4c81))
* recover task state from delegation chains before gate check ([a6e3574](https://github.com/zaxbysauce/opencode-swarm/commit/a6e3574048996b4b60aa285692ddb064bfb76390))
* **release:** realign release-please baseline to v6.19.0 ([02c505a](https://github.com/zaxbysauce/opencode-swarm/commit/02c505a0aa73aca0c9a96c288f04dc6d3cbdedf2))
* remove debug console.log, fix advanceTaskState guard, move batch warnings to system messages ([8f38933](https://github.com/zaxbysauce/opencode-swarm/commit/8f38933575b4ae809e9aa15477b55aa20df860cd))
* remove platform guard from Windows device path check in declare-scope ([10f1b1f](https://github.com/zaxbysauce/opencode-swarm/commit/10f1b1f71f0efb149cf0ed54948288fb46170cbb))
* remove platform guard from Windows device path check in declare-scope ([8aef2c6](https://github.com/zaxbysauce/opencode-swarm/commit/8aef2c6e5379f02a121664e6c2a01ebd4f054377))
* replace bare reviewer/test_engineer agent name references with {{AGENT_PREFIX}} in architect prompt ([e34fdab](https://github.com/zaxbysauce/opencode-swarm/commit/e34fdab4719289bb6e9731ea532de2394a707852))
* resolve .swarm output dir against project root in sbom_generate ([af49bd5](https://github.com/zaxbysauce/opencode-swarm/commit/af49bd5c4cbaeef8700c2aa5783fdad02409c86d))
* resolve .swarm output directory against project root in sbom-generate ([4e5a210](https://github.com/zaxbysauce/opencode-swarm/commit/4e5a210185577f46d65177f05de31f84069e75f4))
* resolve 26 test failures from knowledge system audit ([5bda121](https://github.com/zaxbysauce/opencode-swarm/commit/5bda12182a1210de2f4b9c8c796c728d50f7d9e6))
* resolve all 26 test failures in knowledge system audit ([ae49bc0](https://github.com/zaxbysauce/opencode-swarm/commit/ae49bc04f4bf219275c4801bfb92dccd07eaf962))
* resolve all biome lint errors to restore CI green ([2b19afc](https://github.com/zaxbysauce/opencode-swarm/commit/2b19afcbc1e8b1c8628a50ba6bd89a328b2150a5))
* resolve biome lint errors in regex utility and phase-complete ([bc2a2ac](https://github.com/zaxbysauce/opencode-swarm/commit/bc2a2acfb555e7bf16a0f8072a6cac71fde2295d))
* resolve CI typecheck failure — scope afterCoder in delegation-gate ([1f1c6bf](https://github.com/zaxbysauce/opencode-swarm/commit/1f1c6bf028a30be039bc2ec6f8b4c48b2c080ade))
* resolve path before isSourceCodePath check, fix test gate setup ([d16df29](https://github.com/zaxbysauce/opencode-swarm/commit/d16df2936a0cdc63713ada655c5189d92d368157))
* resolve path before isSourceCodePath check, fix test gate setup ([d498cc0](https://github.com/zaxbysauce/opencode-swarm/commit/d498cc0c171fb19796dadc8cea482824540829d5))
* resolve phase_complete fallback regressions affecting task status flow ([f908425](https://github.com/zaxbysauce/opencode-swarm/commit/f908425906e02c8d2fa8378fad8ec14e97a1091a))
* resolve TypeScript CI failures ([e752163](https://github.com/zaxbysauce/opencode-swarm/commit/e75216340ceeb42374a5f628c3370cd1d277a39b))
* restore architect delegation and add gate status tool ([2223d95](https://github.com/zaxbysauce/opencode-swarm/commit/2223d954b635c769e3e1ecf3ba35f78b16f04a8e))
* restore architect delegation and add gate status tool ([ef8bcb2](https://github.com/zaxbysauce/opencode-swarm/commit/ef8bcb2e1d1ade91b704f1ba26779ac557de714f))
* restore architect delegation and add gate status tool ([8a655ea](https://github.com/zaxbysauce/opencode-swarm/commit/8a655ea7328da6acfd617b5b690000e182666604))
* restore delegation-gate task advancement after task calls ([04c5212](https://github.com/zaxbysauce/opencode-swarm/commit/04c521267daf9fd2bcabcdc7d6a7017d3738d860))
* restore delegation-gate task advancement after task calls ([8894427](https://github.com/zaxbysauce/opencode-swarm/commit/8894427e230d742d3b895a70ead027c4b53d1348))
* restore evidence compatibility and stale workflow expectation ([f91e69e](https://github.com/zaxbysauce/opencode-swarm/commit/f91e69eb1e49b53406699b0b936c023bac84b64a))
* restore evidence compatibility and stale workflow expectation ([2d91300](https://github.com/zaxbysauce/opencode-swarm/commit/2d91300ea733f5c04ae0281c40f7d27a72e116fb))
* restore evidence ID compatibility ([7c71e9a](https://github.com/zaxbysauce/opencode-swarm/commit/7c71e9acf5f6c0871262c0088bf792af7bccdc45))
* restore release-please trigger after non-conventional merge ([00302b3](https://github.com/zaxbysauce/opencode-swarm/commit/00302b34deef33b536de547df726094e1fc9fc5d))
* restore release-please trigger with conventional commit guidance ([4caa55b](https://github.com/zaxbysauce/opencode-swarm/commit/4caa55b7ba489bf73d67e9996a1722582f4f1f06))
* seed task workflow state in new sessions during cross-session propagation ([1b49604](https://github.com/zaxbysauce/opencode-swarm/commit/1b496042b581634adc53a0bcbaf7b4e9e99a4cee))
* seed task workflow state in new sessions during cross-session propagation ([2c51514](https://github.com/zaxbysauce/opencode-swarm/commit/2c5151477866411e0dfb461b71d234a50d893f15))
* silent catch blocks in delegation-gate now log warnings; gate heuristic checks on coder delegation; fix [ ] sanitization ([b28dae1](https://github.com/zaxbysauce/opencode-swarm/commit/b28dae1e860a0f25b44181b0019aaae59b7169fe))
* state machine never advances on default config and CLI writes wrong config file ([#81](https://github.com/zaxbysauce/opencode-swarm/issues/81) [#84](https://github.com/zaxbysauce/opencode-swarm/issues/84)) ([ac8dffa](https://github.com/zaxbysauce/opencode-swarm/commit/ac8dffaaf6fb7c94675fa22621125cc420c20c57))
* state machine never advances on default config and CLI writes wrong config file ([#81](https://github.com/zaxbysauce/opencode-swarm/issues/81) [#84](https://github.com/zaxbysauce/opencode-swarm/issues/84)) ([9023b40](https://github.com/zaxbysauce/opencode-swarm/commit/9023b406527469672c644bb39610dae1e4fcd8e7))
* suppress repeated violation warnings and route all guardrail guidance to system messages ([9500d72](https://github.com/zaxbysauce/opencode-swarm/commit/9500d729353984d8732cb6f029216ec4fe626f38))
* sync active task identity for durable evidence ([f2f7291](https://github.com/zaxbysauce/opencode-swarm/commit/f2f729195b66bdaa0fedf200c0d45dc6078b953c))
* sync active task identity for durable evidence ([058e036](https://github.com/zaxbysauce/opencode-swarm/commit/058e0366769a85ac27a1d29596ca23ca9838afc6))
* test isolation - use DI for curator runner, loosen drift path traversal assertion ([e334e7d](https://github.com/zaxbysauce/opencode-swarm/commit/e334e7d461ad322b13d03765bf5c9531981b70c5))
* **tests:** always write explicit curator config in test helper to prevent user config leak ([d0543f4](https://github.com/zaxbysauce/opencode-swarm/commit/d0543f457488d59e42cdbd7dc6aa6562584603f2))
* **tests:** always write explicit curator config to prevent user config leak ([1e6a571](https://github.com/zaxbysauce/opencode-swarm/commit/1e6a571a009b3cd82d1ecb31a1c29b8024842e5b))
* **tests:** correct phase_complete adversarial test expectations for RETROSPECTIVE_MISSING behavior ([bc0383f](https://github.com/zaxbysauce/opencode-swarm/commit/bc0383ff14577e4f4fd18152d001c6c41c5500bf))
* **tests:** replace .resolves.not.toThrow() with Bun-compatible await pattern ([dd31ca5](https://github.com/zaxbysauce/opencode-swarm/commit/dd31ca5ee5b45489ef9ab0f09380a601d9dd737c))
* **tests:** replace .resolves.not.toThrow() with Bun-compatible await pattern ([d98173d](https://github.com/zaxbysauce/opencode-swarm/commit/d98173d99892f390b68e4cdae98bd7fbdac1cac7))
* tool hardening and Windows CI native-dep removal ([e6155e0](https://github.com/zaxbysauce/opencode-swarm/commit/e6155e09bed9705c1970c6b0d61b16ef6b24d804))
* tool-based task gate evidence store (Issue [#146](https://github.com/zaxbysauce/opencode-swarm/issues/146)) ([c2a34c2](https://github.com/zaxbysauce/opencode-swarm/commit/c2a34c213afdb67067656b91354bae62d4eda57e))
* tool-based task gate evidence store (Issues [#146](https://github.com/zaxbysauce/opencode-swarm/issues/146), [#145](https://github.com/zaxbysauce/opencode-swarm/issues/145)) ([37cedaf](https://github.com/zaxbysauce/opencode-swarm/commit/37cedafc091ab9839ad222f6d4c52031829b0f92))
* **tools:** expose update_task_status and write_retro, repair retro compatibility, harden architect prompt ([694dd16](https://github.com/zaxbysauce/opencode-swarm/commit/694dd1656bd34dc5ffbfac71c0587bd898c6b9a0))
* update test expectations to match wired detectors and hardened safety guards ([6f50f6e](https://github.com/zaxbysauce/opencode-swarm/commit/6f50f6e3246c2a5555ee65e74ec757f1da0b600b))
* use directory instead of process.cwd() in delegation-gate fallback evidence path ([3aef904](https://github.com/zaxbysauce/opencode-swarm/commit/3aef904459c470bbfe30c6e873ef03a50b3474cf))
* use dynamic agent prefix in system-enhancer injected prompt text ([1873088](https://github.com/zaxbysauce/opencode-swarm/commit/187308862fc99897e8515e786e332e63baaf7d94))
* use workspace directory as cwd for all subprocess calls ([5e24335](https://github.com/zaxbysauce/opencode-swarm/commit/5e243354e3f7828c7537e9d69b4e65261025173e))
* use workspace directory as cwd for all subprocess calls ([3d855b6](https://github.com/zaxbysauce/opencode-swarm/commit/3d855b6f012c49543b86a40509cb749de63cbfcb))


### Reverts

* undo direct push of architect delegation and gate status hotfix ([326b323](https://github.com/zaxbysauce/opencode-swarm/commit/326b323eab6b60e9c23d5fbf34fb338b72ca0553))

## [6.26.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.9...v6.26.0) (2026-03-14)


### Features

* implement session durability and Turbo Mode controls (v6.26) ([a87eb95](https://github.com/zaxbysauce/opencode-swarm/commit/a87eb95065985e82f9a158e24cd64dc6dc2902df))
* session durability and Turbo Mode controls (v6.26) ([9d7eb32](https://github.com/zaxbysauce/opencode-swarm/commit/9d7eb32f0a69c06e5566d75c4620c023d7a71cfd))


### Bug Fixes

* resolve TypeScript CI failures ([e752163](https://github.com/zaxbysauce/opencode-swarm/commit/e75216340ceeb42374a5f628c3370cd1d277a39b))

## [6.25.9](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.8...v6.25.9) (2026-03-14)


### Bug Fixes

* restore evidence compatibility and stale workflow expectation ([f91e69e](https://github.com/zaxbysauce/opencode-swarm/commit/f91e69eb1e49b53406699b0b936c023bac84b64a))
* restore evidence compatibility and stale workflow expectation ([2d91300](https://github.com/zaxbysauce/opencode-swarm/commit/2d91300ea733f5c04ae0281c40f7d27a72e116fb))

## [6.25.8](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.7...v6.25.8) (2026-03-14)


### Bug Fixes

* clean up remaining workflow tech debt ([5b8cabc](https://github.com/zaxbysauce/opencode-swarm/commit/5b8cabc5f605d5764ca3faff27066a028f173f72))
* clean up remaining workflow tech debt ([e052c3d](https://github.com/zaxbysauce/opencode-swarm/commit/e052c3d51f121202b45350dd7c43ecd6dd35761b))
* remove platform guard from Windows device path check in declare-scope ([10f1b1f](https://github.com/zaxbysauce/opencode-swarm/commit/10f1b1f71f0efb149cf0ed54948288fb46170cbb))
* remove platform guard from Windows device path check in declare-scope ([8aef2c6](https://github.com/zaxbysauce/opencode-swarm/commit/8aef2c6e5379f02a121664e6c2a01ebd4f054377))
* restore evidence ID compatibility ([7c71e9a](https://github.com/zaxbysauce/opencode-swarm/commit/7c71e9acf5f6c0871262c0088bf792af7bccdc45))

## [6.25.7](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.6...v6.25.7) (2026-03-14)


### Bug Fixes

* pass explicit directories to delegation gate tests ([3a798d4](https://github.com/zaxbysauce/opencode-swarm/commit/3a798d477f8d7f4fd2674867e1f6aca2e61ee203))
* pass explicit directories to delegation gate tests ([6d722bb](https://github.com/zaxbysauce/opencode-swarm/commit/6d722bb5c79a837a77ed4025a48b7a9c8343e121))

## [6.25.6](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.5...v6.25.6) (2026-03-14)


### Bug Fixes

* complete remaining workflow reliability hotfixes ([a88d0a8](https://github.com/zaxbysauce/opencode-swarm/commit/a88d0a8970663bc3e787f9cd04098dd06d91197c))
* complete remaining workflow reliability hotfixes ([d76fa58](https://github.com/zaxbysauce/opencode-swarm/commit/d76fa586bd5c846a4d823ce3d2999edaaa78f225))

## [6.25.5](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.4...v6.25.5) (2026-03-14)


### Bug Fixes

* sync active task identity for durable evidence ([f2f7291](https://github.com/zaxbysauce/opencode-swarm/commit/f2f729195b66bdaa0fedf200c0d45dc6078b953c))
* sync active task identity for durable evidence ([058e036](https://github.com/zaxbysauce/opencode-swarm/commit/058e0366769a85ac27a1d29596ca23ca9838afc6))

## [6.25.4](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.3...v6.25.4) (2026-03-13)


### Bug Fixes

* align tests with wired detectors and hardened interactive safety gates ([5c9701e](https://github.com/zaxbysauce/opencode-swarm/commit/5c9701e8793bd0d807be27d2623c155851dd67ab))
* harden interactive test runner safety gates ([0a1e66e](https://github.com/zaxbysauce/opencode-swarm/commit/0a1e66e232a6895cc8dc3d49fa811c9588d5c731))
* harden interactive test runner safety gates ([3b489f4](https://github.com/zaxbysauce/opencode-swarm/commit/3b489f46e248bcc4dccd78cf6d62395a63a34718))
* update test expectations to match wired detectors and hardened safety guards ([6f50f6e](https://github.com/zaxbysauce/opencode-swarm/commit/6f50f6e3246c2a5555ee65e74ec757f1da0b600b))

## [6.25.3](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.2...v6.25.3) (2026-03-13)


### Bug Fixes

* record explorer and sme gate evidence ([f3e60de](https://github.com/zaxbysauce/opencode-swarm/commit/f3e60de2a096450d6302b2a19a68180b8a500c08))
* record explorer and sme gate evidence ([833cced](https://github.com/zaxbysauce/opencode-swarm/commit/833cced7a61a1fb5cba004a8cbcef1dbff4b4c81))

## [6.25.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.1...v6.25.2) (2026-03-13)


### Bug Fixes

* delegation-gate fallback evidence writes use process.cwd() instead of directory ([b163737](https://github.com/zaxbysauce/opencode-swarm/commit/b16373712cefa323c760aa0d368d3c44dc519af2))
* reconcile evidence handling and contain test scope ([cea26ec](https://github.com/zaxbysauce/opencode-swarm/commit/cea26ec1aa5754d5a8b213d4c13a05fd658978b7))
* reconcile evidence handling and contain test scope ([8ebf15a](https://github.com/zaxbysauce/opencode-swarm/commit/8ebf15a4e84685feda136dce66421c9c6076683a))
* use directory instead of process.cwd() in delegation-gate fallback evidence path ([3aef904](https://github.com/zaxbysauce/opencode-swarm/commit/3aef904459c470bbfe30c6e873ef03a50b3474cf))

## [6.25.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.25.0...v6.25.1) (2026-03-13)


### Bug Fixes

* restore architect delegation and add gate status tool ([2223d95](https://github.com/zaxbysauce/opencode-swarm/commit/2223d954b635c769e3e1ecf3ba35f78b16f04a8e))
* restore architect delegation and add gate status tool ([ef8bcb2](https://github.com/zaxbysauce/opencode-swarm/commit/ef8bcb2e1d1ade91b704f1ba26779ac557de714f))
* restore architect delegation and add gate status tool ([8a655ea](https://github.com/zaxbysauce/opencode-swarm/commit/8a655ea7328da6acfd617b5b690000e182666604))


### Reverts

* undo direct push of architect delegation and gate status hotfix ([326b323](https://github.com/zaxbysauce/opencode-swarm/commit/326b323eab6b60e9c23d5fbf34fb338b72ca0553))

## [6.25.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.24.0...v6.25.0) (2026-03-13)


### Features

* **agents:** complete audit phase 4-6 — remaining 13 deferred items ([d4001fa](https://github.com/zaxbysauce/opencode-swarm/commit/d4001fa0e07d94f429e59a3003078826bc052c66))
* **agents:** complete audit phase 4-6 — remaining 13 deferred items ([d60f3e2](https://github.com/zaxbysauce/opencode-swarm/commit/d60f3e2e0b176c52a8182b1c09d0ae66abdd8ce9))


### Bug Fixes

* **agents:** align prompt contracts with audit intent ([1999097](https://github.com/zaxbysauce/opencode-swarm/commit/19990975925bf61facb448b0b24472e09df870f4))
* align prompt drift contracts and tests ([3d94e0f](https://github.com/zaxbysauce/opencode-swarm/commit/3d94e0fce3fc3e2b8668a48ab190f6012ef9faca))

## [6.24.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.23.2...v6.24.0) (2026-03-12)


### Features

* **agents:** add defensive coding rules and error handling to coder (C1, C2, X3, X4) ([cbb2220](https://github.com/zaxbysauce/opencode-swarm/commit/cbb22202ecd289b824335abb6d99aacc66ffa87c))
* **agents:** add differential review focus and structured reasoning to reviewer (R1, R2, X3, X4) ([45e9069](https://github.com/zaxbysauce/opencode-swarm/commit/45e9069f90609787d36a7e089e7f3b5a1dd8cde2))
* **agents:** add documentation scope rules to docs (D1, X3, X4) ([e39d22b](https://github.com/zaxbysauce/opencode-swarm/commit/e39d22b9a16e57289a08b3288f5e8f573453f738))
* **agents:** add research protocol and confidence calibration to sme (S1, X3, X4) ([b1f250d](https://github.com/zaxbysauce/opencode-swarm/commit/b1f250d00ba31f20d9265a2a0dad2f9c949c5d3c))
* **agents:** add structured codebase analysis protocol to explorer (E1, X3, X4) ([b2d346c](https://github.com/zaxbysauce/opencode-swarm/commit/b2d346c8867a62e891d63d54768be29bba6a0b31))
* **agents:** overhaul test-engineer prompt (T1-T4, X3, X4) ([b830f91](https://github.com/zaxbysauce/opencode-swarm/commit/b830f91ae2b82833607274227484b42977ab2293))


### Bug Fixes

* **agents:** escape backticks in coder and docs template literals ([2f4faf4](https://github.com/zaxbysauce/opencode-swarm/commit/2f4faf4f8522f77c9d84ea83aca52c5d176bfeac))
* align agent prompt contracts and tests ([c5a906e](https://github.com/zaxbysauce/opencode-swarm/commit/c5a906e9c33d3e4a37aa4f515a55ee14e6cfea4f))

## [6.23.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.23.1...v6.23.2) (2026-03-12)


### Bug Fixes

* align gate evidence fixes with tracked dist output ([cb1405a](https://github.com/zaxbysauce/opencode-swarm/commit/cb1405ade97705b86a1664ea019502760507ad3e))
* resolve CI typecheck failure — scope afterCoder in delegation-gate ([1f1c6bf](https://github.com/zaxbysauce/opencode-swarm/commit/1f1c6bf028a30be039bc2ec6f8b4c48b2c080ade))
* tool-based task gate evidence store (Issue [#146](https://github.com/zaxbysauce/opencode-swarm/issues/146)) ([c2a34c2](https://github.com/zaxbysauce/opencode-swarm/commit/c2a34c213afdb67067656b91354bae62d4eda57e))
* tool-based task gate evidence store (Issues [#146](https://github.com/zaxbysauce/opencode-swarm/issues/146), [#145](https://github.com/zaxbysauce/opencode-swarm/issues/145)) ([37cedaf](https://github.com/zaxbysauce/opencode-swarm/commit/37cedafc091ab9839ad222f6d4c52031829b0f92))

## [6.23.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.23.0...v6.23.1) (2026-03-12)


### Bug Fixes

* recover task state from delegation chains before gate check ([a6e3574](https://github.com/zaxbysauce/opencode-swarm/commit/a6e3574048996b4b60aa285692ddb064bfb76390))

## [6.23.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.21...v6.23.0) (2026-03-12)


### Features

* implement glob/path exclude patterns and .secretscanignore support for secretscan ([4271898](https://github.com/zaxbysauce/opencode-swarm/commit/42718983db6f6bed160990a52c0906c3ac886da3))
* **secretscan:** glob/path exclude patterns and .secretscanignore support ([4a3a91a](https://github.com/zaxbysauce/opencode-swarm/commit/4a3a91a613710a599831b1f159bf62ece963c957))

## [6.22.21](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.20...v6.22.21) (2026-03-12)


### Bug Fixes

* seed task workflow state in new sessions during cross-session propagation ([1b49604](https://github.com/zaxbysauce/opencode-swarm/commit/1b496042b581634adc53a0bcbaf7b4e9e99a4cee))
* seed task workflow state in new sessions during cross-session propagation ([2c51514](https://github.com/zaxbysauce/opencode-swarm/commit/2c5151477866411e0dfb461b71d234a50d893f15))

## [6.22.20](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.19...v6.22.20) (2026-03-12)


### Bug Fixes

* resolve 26 test failures from knowledge system audit ([5bda121](https://github.com/zaxbysauce/opencode-swarm/commit/5bda12182a1210de2f4b9c8c796c728d50f7d9e6))
* resolve all 26 test failures in knowledge system audit ([ae49bc0](https://github.com/zaxbysauce/opencode-swarm/commit/ae49bc04f4bf219275c4801bfb92dccd07eaf962))

## [6.22.19](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.18...v6.22.19) (2026-03-12)


### Bug Fixes

* correct broken anchor in docs/configuration.md ([40daacc](https://github.com/zaxbysauce/opencode-swarm/commit/40daaccd0a63ab81d876613e07a9c26f84af0b60))
* correct broken anchor in docs/configuration.md to #configuration-reference ([169b4c7](https://github.com/zaxbysauce/opencode-swarm/commit/169b4c756e50d1d794e44de92cdd7d4a7183bff3))

## [6.22.18](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.17...v6.22.18) (2026-03-12)


### Bug Fixes

* centralize regex safety with escapeRegex/simpleGlobToRegex utilities ([2139031](https://github.com/zaxbysauce/opencode-swarm/commit/2139031404d2573d92b631408df5be66042d488b))
* centralize regex safety with escapeRegex/simpleGlobToRegex utilities ([efd034d](https://github.com/zaxbysauce/opencode-swarm/commit/efd034dd13eada386e15a3d259a37fa4269ec235))
* resolve biome lint errors in regex utility and phase-complete ([bc2a2ac](https://github.com/zaxbysauce/opencode-swarm/commit/bc2a2acfb555e7bf16a0f8072a6cac71fde2295d))

## [6.22.17](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.16...v6.22.17) (2026-03-12)


### Bug Fixes

* code review group A — JSON safety, regex escaping, directory threading ([590df9a](https://github.com/zaxbysauce/opencode-swarm/commit/590df9a4ca8bb0811ea0396691b4cb28a9598e57))
* harden JSON.parse, escape regex injection, thread directory into pipeline-tracker ([20b1163](https://github.com/zaxbysauce/opencode-swarm/commit/20b1163f1ca0925ef53aec65018545b7af9d2974))

## [6.22.16](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.15...v6.22.16) (2026-03-12)


### Bug Fixes

* resolve .swarm output dir against project root in sbom_generate ([af49bd5](https://github.com/zaxbysauce/opencode-swarm/commit/af49bd5c4cbaeef8700c2aa5783fdad02409c86d))
* resolve .swarm output directory against project root in sbom-generate ([4e5a210](https://github.com/zaxbysauce/opencode-swarm/commit/4e5a210185577f46d65177f05de31f84069e75f4))

## [6.22.15](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.14...v6.22.15) (2026-03-11)


### Bug Fixes

* honor qa_gates reviewer override in catastrophic phase checks ([17d2e79](https://github.com/zaxbysauce/opencode-swarm/commit/17d2e793dd9e62736d2b2d9c7697fa7eb6c79626))
* honor reviewer qa override in catastrophic checks ([c46b3da](https://github.com/zaxbysauce/opencode-swarm/commit/c46b3daa853049a6d2f0c3128e36e28c6fda0a6f))

## [6.22.14](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.13...v6.22.14) (2026-03-11)


### Bug Fixes

* add {{AGENT_PREFIX}} to remaining bare architect reference in FOR tag example ([6545fe0](https://github.com/zaxbysauce/opencode-swarm/commit/6545fe080cd302d5a189aff9439e68e71964863b))
* normalize bare agent name references in prompts to use {{AGENT_PREFIX}} ([efeb4bf](https://github.com/zaxbysauce/opencode-swarm/commit/efeb4bf099409151fa80ccadf1f319ceb8ce1eea))
* use dynamic agent prefix in system-enhancer injected prompt text ([1873088](https://github.com/zaxbysauce/opencode-swarm/commit/187308862fc99897e8515e786e332e63baaf7d94))

## [6.22.13](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.12...v6.22.13) (2026-03-11)


### Bug Fixes

* harden phase_complete agent aggregation and warnings ([cd5b202](https://github.com/zaxbysauce/opencode-swarm/commit/cd5b20257addf7019226764358810a6a10fdf73e))
* resolve phase_complete fallback regressions affecting task status flow ([f908425](https://github.com/zaxbysauce/opencode-swarm/commit/f908425906e02c8d2fa8378fad8ec14e97a1091a))

## [6.22.12](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.11...v6.22.12) (2026-03-11)


### Bug Fixes

* **issue-124:** checkReviewerGate skips corrupt sessions; fix mock leakage in phase-monitor tests ([dc1da81](https://github.com/zaxbysauce/opencode-swarm/commit/dc1da8126aa4b3f53f528330404b48a3f728c68f))
* silent catch blocks in delegation-gate now log warnings; gate heuristic checks on coder delegation; fix [ ] sanitization ([b28dae1](https://github.com/zaxbysauce/opencode-swarm/commit/b28dae1e860a0f25b44181b0019aaae59b7169fe))
* test isolation - use DI for curator runner, loosen drift path traversal assertion ([e334e7d](https://github.com/zaxbysauce/opencode-swarm/commit/e334e7d461ad322b13d03765bf5c9531981b70c5))

## [6.22.11](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.10...v6.22.11) (2026-03-11)


### Bug Fixes

* remove debug console.log, fix advanceTaskState guard, move batch warnings to system messages ([8f38933](https://github.com/zaxbysauce/opencode-swarm/commit/8f38933575b4ae809e9aa15477b55aa20df860cd))

## [6.22.10](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.9...v6.22.10) (2026-03-11)


### Bug Fixes

* move violation warnings to system messages and suppress repeated self-coding alerts ([e1d55b9](https://github.com/zaxbysauce/opencode-swarm/commit/e1d55b9303c7fd6e12b8f1d8ad46ef26aa51a50b))
* suppress repeated violation warnings and route all guardrail guidance to system messages ([9500d72](https://github.com/zaxbysauce/opencode-swarm/commit/9500d729353984d8732cb6f029216ec4fe626f38))

## [6.22.9](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.8...v6.22.9) (2026-03-11)


### Bug Fixes

* normalize prefixed agent names in isAgentDelegation to unblock QA gates for non-default swarms ([4ec0fc6](https://github.com/zaxbysauce/opencode-swarm/commit/4ec0fc6cd24cdca2ae32472ddec132e2b4c0263d))
* normalize subagent_type with stripKnownSwarmPrefix in isAgentDelegation to support prefixed agents like mega_reviewer/mega_test_engineer ([44eb706](https://github.com/zaxbysauce/opencode-swarm/commit/44eb706aa48107d86f3c2ec1d63a12d52d75ca9f))

## [6.22.8](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.7...v6.22.8) (2026-03-11)


### Bug Fixes

* restore release-please trigger after non-conventional merge ([00302b3](https://github.com/zaxbysauce/opencode-swarm/commit/00302b34deef33b536de547df726094e1fc9fc5d))
* restore release-please trigger with conventional commit guidance ([4caa55b](https://github.com/zaxbysauce/opencode-swarm/commit/4caa55b7ba489bf73d67e9996a1722582f4f1f06))

## [6.22.7](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.6...v6.22.7) (2026-03-10)


### Bug Fixes

* phase_complete updates plan.json on success and adds completed-task fallback for agent requirements ([07c001d](https://github.com/zaxbysauce/opencode-swarm/commit/07c001d470152de7743ebd4bd8dc1d3f99af645b))
* phase_complete updates plan.json on success and adds completed-task fallback for agent requirements ([14888eb](https://github.com/zaxbysauce/opencode-swarm/commit/14888ebfc54d734e6f35ee114ae6b8efedc76401))

## [6.22.6](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.5...v6.22.6) (2026-03-10)


### Bug Fixes

* read subagent_type from input.args in tool.execute.after hook ([87a0b1f](https://github.com/zaxbysauce/opencode-swarm/commit/87a0b1f406a2db367e5c04783534be812f11c62a))
* read subagent_type from input.args in tool.execute.after hook ([045c69d](https://github.com/zaxbysauce/opencode-swarm/commit/045c69d5ed2c7046963b25f2a1f28fd57f452803))

## [6.22.5](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.4...v6.22.5) (2026-03-10)


### Bug Fixes

* normalize task handoff and clarify architect setup ([c4c5cbb](https://github.com/zaxbysauce/opencode-swarm/commit/c4c5cbb8f127008823471055df9749cee9a202c3))
* normalize task tool name for architect handoff ([c832728](https://github.com/zaxbysauce/opencode-swarm/commit/c832728e533854d7da7e615692254e92913f4a6b))

## [6.22.4](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.3...v6.22.4) (2026-03-10)


### Bug Fixes

* restore delegation-gate task advancement after task calls ([04c5212](https://github.com/zaxbysauce/opencode-swarm/commit/04c521267daf9fd2bcabcdc7d6a7017d3738d860))
* restore delegation-gate task advancement after task calls ([8894427](https://github.com/zaxbysauce/opencode-swarm/commit/8894427e230d742d3b895a70ead027c4b53d1348))

## [6.22.3](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.2...v6.22.3) (2026-03-09)


### Bug Fixes

* persist phaseAgentsDispatched across session restarts for phase_complete ([9b8d53e](https://github.com/zaxbysauce/opencode-swarm/commit/9b8d53ead540dacad19b2edccf6b41b4276f2926))
* persist phaseAgentsDispatched across session restarts for phase_complete ([bb1e068](https://github.com/zaxbysauce/opencode-swarm/commit/bb1e0688116fea45068f217da127c3ff8ed8e0d8))

## [6.22.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.1...v6.22.2) (2026-03-09)


### Bug Fixes

* **tests:** always write explicit curator config in test helper to prevent user config leak ([d0543f4](https://github.com/zaxbysauce/opencode-swarm/commit/d0543f457488d59e42cdbd7dc6aa6562584603f2))
* **tests:** always write explicit curator config to prevent user config leak ([1e6a571](https://github.com/zaxbysauce/opencode-swarm/commit/1e6a571a009b3cd82d1ecb31a1c29b8024842e5b))

## [6.22.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.22.0...v6.22.1) (2026-03-09)


### Bug Fixes

* **tests:** replace .resolves.not.toThrow() with Bun-compatible await pattern ([dd31ca5](https://github.com/zaxbysauce/opencode-swarm/commit/dd31ca5ee5b45489ef9ab0f09380a601d9dd737c))
* **tests:** replace .resolves.not.toThrow() with Bun-compatible await pattern ([d98173d](https://github.com/zaxbysauce/opencode-swarm/commit/d98173d99892f390b68e4cdae98bd7fbdac1cac7))

## [6.22.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.21.3...v6.22.0) (2026-03-09)


### Features

* add Curator background analysis system with phase-level drift detection and knowledge injection ([8cf8d07](https://github.com/zaxbysauce/opencode-swarm/commit/8cf8d07ed8383948288fed53b31c6c0d0f8dfc91))


### Bug Fixes

* persist taskWorkflowStates in session snapshots and reconcile states from plan (Issue [#81](https://github.com/zaxbysauce/opencode-swarm/issues/81)) ([d5c3637](https://github.com/zaxbysauce/opencode-swarm/commit/d5c36376dee5d0db5bf19d6047f3bad346f086dd))
* resolve all biome lint errors to restore CI green ([2b19afc](https://github.com/zaxbysauce/opencode-swarm/commit/2b19afcbc1e8b1c8628a50ba6bd89a328b2150a5))

## [6.21.3]

### Phase 7 – Curator Documentation

* Updated `README.md` with complete Curator feature documentation — configuration table (8 fields), pipeline overview, and Issue #81 hotfix notes (taskWorkflowStates persistence, reconcileTaskStatesFromPlan behavior).
* Updated `docs/planning.md` with Curator integration guide — phase-monitor init, phase-complete pipeline, knowledge-injector drift injection, DriftReport interface, and config quick-reference table.

### Phase 6 – Curator Integration Wiring

* Added curator pipeline wiring after `curateAndStoreSwarm` in `phase_complete` (runCuratorPhase → applyCuratorKnowledgeUpdates → runCriticDriftCheck). Wrapped in try/catch to ensure phase_complete never blocks.
* Added Curator init call in `phase_monitor` first‑phase guard with try/catch.
* Added drift injection in `knowledge_injector` (readPriorDriftReports → buildDriftInjectionText → prepend to cachedInjectionText) wrapped in try/catch.
* Added corresponding unit tests for these behaviours.(https://github.com/zaxbysauce/opencode-swarm/compare/v6.21.2...v6.21.3) (2026-03-08)


### Bug Fixes

* plumb ToolContext.sessionID into phase_complete to fix cross-session tracking ([be22929](https://github.com/zaxbysauce/opencode-swarm/commit/be22929273309b22876e6d612263bb007ebce4d3))
* plumb ToolContext.sessionID into phase_complete to fix cross-session tracking ([e7f898e](https://github.com/zaxbysauce/opencode-swarm/commit/e7f898e1f43cbd83f20b9511a9afec88489dda26)), closes [#89](https://github.com/zaxbysauce/opencode-swarm/issues/89)

## [6.21.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.21.1...v6.21.2) (2026-03-08)


### Bug Fixes

* state machine never advances on default config and CLI writes wrong config file ([#81](https://github.com/zaxbysauce/opencode-swarm/issues/81) [#84](https://github.com/zaxbysauce/opencode-swarm/issues/84)) ([ac8dffa](https://github.com/zaxbysauce/opencode-swarm/commit/ac8dffaaf6fb7c94675fa22621125cc420c20c57))
* state machine never advances on default config and CLI writes wrong config file ([#81](https://github.com/zaxbysauce/opencode-swarm/issues/81) [#84](https://github.com/zaxbysauce/opencode-swarm/issues/84)) ([9023b40](https://github.com/zaxbysauce/opencode-swarm/commit/9023b406527469672c644bb39610dae1e4fcd8e7))

## [6.21.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.21.0...v6.21.1) (2026-03-08)


### Bug Fixes

* **hotfix-78:** summarization verification, gate-state wiring, and plan-state guard hardening ([1bc62e8](https://github.com/zaxbysauce/opencode-swarm/commit/1bc62e8993c2307e35bcd00dc836e531f044de63))
* **hotfix-78:** summarization verification, gate-state wiring, and plan-state guard hardening ([a42f4f1](https://github.com/zaxbysauce/opencode-swarm/commit/a42f4f1298b04518f1be8d7ca23825f201b518b7))
* **lint:** replace control character regex literal with RegExp constructor to fix noControlCharactersInRegex CI error ([0673429](https://github.com/zaxbysauce/opencode-swarm/commit/0673429f3247dfee94f4e0a8c7194bc06264ced1))

## [6.21.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.20.3...v6.21.0) (2026-03-07)


### Features

* **gate-enforcement:** add per-task state machine, scope declaration, and hard blocks ([a1ab8ad](https://github.com/zaxbysauce/opencode-swarm/commit/a1ab8adb8378b3402c97184328e61442fd80774f))
* **gate-enforcement:** per-task state machine, scope declaration, and hard blocks (v6.21) ([90324cf](https://github.com/zaxbysauce/opencode-swarm/commit/90324cf53a88a7ad0132f9d8786b084d3e95e035))

## [6.20.3](https://github.com/zaxbysauce/opencode-swarm/compare/v6.20.2...v6.20.3) (2026-03-07)


### Bug Fixes

* resolve path before isSourceCodePath check, fix test gate setup ([d16df29](https://github.com/zaxbysauce/opencode-swarm/commit/d16df2936a0cdc63713ada655c5189d92d368157))
* resolve path before isSourceCodePath check, fix test gate setup ([d498cc0](https://github.com/zaxbysauce/opencode-swarm/commit/d498cc0c171fb19796dadc8cea482824540829d5))

## [6.20.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.20.1...v6.20.2) (2026-03-07)


### Bug Fixes

* gate warn() behind DEBUG and block direct plan.md writes ([4763f25](https://github.com/zaxbysauce/opencode-swarm/commit/4763f25f29405930b2fe91ecfe7e6f44dc7f98f9))
* gate warn() behind DEBUG and block direct plan.md writes ([36897b1](https://github.com/zaxbysauce/opencode-swarm/commit/36897b1236994a2ac0013b299679ee787606114e))

## [6.20.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.20.0...v6.20.1) (2026-03-07)


### Bug Fixes

* **dist:** rebuild dist after lint fixes ([fb5be58](https://github.com/zaxbysauce/opencode-swarm/commit/fb5be5821387815798f99744a35cc0cfc168b4e8))
* **dist:** rebuild dist artifacts for cwd fixes and delegation-gate additions ([6ed7a5b](https://github.com/zaxbysauce/opencode-swarm/commit/6ed7a5b9169f0130997bac6cbcf90a48c4064cbd))
* **lint:** resolve biome lint errors to unblock CI ([1aefafb](https://github.com/zaxbysauce/opencode-swarm/commit/1aefafb7ef46dbc84cd23c028fac6591a31c1fa0))
* use workspace directory as cwd for all subprocess calls ([5e24335](https://github.com/zaxbysauce/opencode-swarm/commit/5e243354e3f7828c7537e9d69b4e65261025173e))
* use workspace directory as cwd for all subprocess calls ([3d855b6](https://github.com/zaxbysauce/opencode-swarm/commit/3d855b6f012c49543b86a40509cb749de63cbfcb))

## [6.20.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.8...v6.20.0) (2026-03-07)


### Features

* **v6.20:** add AST diffing, parallelism framework, PR gate, checkpoint extension, agent output, skill versioning, and context efficiency ([f13ea28](https://github.com/zaxbysauce/opencode-swarm/commit/f13ea285cb862dc0e5dae5e641b560bd5c0ffac5))

#### New: PR-Based Human Gate (`src/git/`)
Swarm can now create branches, stage/commit files, and open GitHub PRs automatically at phase boundaries.
- `src/git/branch.ts` — `createBranch()`, `stageAll()`, `stageFiles()` (throws on empty array), `getCurrentBranch()`, `getCurrentSha()`
- `src/git/pr.ts` — `createPullRequest()` with `sanitizeInput()` for all gh CLI args, `generateEvidenceMd()` to attach swarm evidence as PR body
- `src/git/index.ts` — `runPRWorkflow()` orchestrates branch → commit → PR in one call

**Configuration:** No new config keys required. Uses your existing `gh` CLI authentication. Set `baseBranch` in `runPRWorkflow()` options to override the default (`main`).

#### New: Parallelism Framework (`src/parallel/`)
Infrastructure for tracking, routing, and coordinating parallel task execution.
- `src/parallel/meta-indexer.ts` — Indexes `meta.summary` fields from `events.jsonl` for parallel task introspection
- `src/parallel/review-router.ts` — Routes tasks to single or double reviewer based on complexity score
- `src/parallel/dependency-graph.ts` — Builds a dependency graph from `plan.json`, performs topological sort, detects circular dependencies
- `src/parallel/file-locks.ts` — Atomic file locking with TTL expiry and path traversal protection

**Configuration:** No configuration required in v6.20 — these modules are used internally by the swarm runtime.

#### New: AST-Aware Diffing (`src/diff/`)
Structured diff analysis using AST language definitions.
- `src/diff/ast-diff.ts` — `computeASTDiff()` returns typed `ASTChange[]` (added/removed/modified nodes) using tree-sitter grammars where available, falling back to line-diff for unsupported languages

**Configuration:** No configuration required. AST diff is invoked automatically by the diff gate when the changed file's language is registered in `src/lang/registry.ts`.

#### New: Role-Scoped Context Filter (`src/context/`)
Reduces context window pressure by filtering messages that don't apply to the receiving agent's role.
- `src/context/role-filter.ts` — Filters context entries based on `[FOR: agent1, agent2]` tags; entries tagged `[FOR: ALL]` are always passed through
- `src/context/zone-classifier.ts` — Classifies files into zones (`production` / `test` / `config` / `generated` / `docs` / `build`) to enforce file authority rules

**Configuration:** Tag your swarm output with `[FOR: reviewer, test_engineer]` or `[FOR: ALL]` to control which agents receive each context entry. No config key changes needed.

#### New: Agent Output Writer (`src/output/`)
Structured output formatting for agent responses.
- `src/output/agent-writer.ts` — `writeAgentOutput()` formats agent results with `meta.summary`, verdict, and structured sections; `readAgentOutput()` retrieves stored outputs; `listAgentOutputs()` enumerates all agent output files

**Configuration:** No configuration required. Output writer is used by architect hooks automatically.

#### New: Skill Versioning (`src/skills/`)
Skills now carry a `SKILL_VERSION` for compatibility tracking and can be overridden per agent.
- `src/skills/index.ts` — Exports `SKILL_VERSION`, base skill definitions, and per-agent overlay maps

**Configuration:** No action required. `SKILL_VERSION` is embedded in agent system prompts automatically.

#### New: Project Identity (`src/knowledge/`)
Each project now generates a stable identity hash for cross-session knowledge correlation.
- `src/knowledge/identity.ts` — `getOrCreateIdentity()` creates `.swarm/identity.json` with `projectHash`, `projectName`, `repoUrl`, and `absolutePath`

**Configuration:** Identity is created automatically on first swarm run. No configuration needed.

#### New: /swarm checkpoint Command (`src/commands/checkpoint.ts`)
The checkpoint system now has a user-facing slash command in addition to the existing tool.
- `/swarm checkpoint save [label]` — Save a named checkpoint
- `/swarm checkpoint restore [label]` — Restore to a checkpoint (soft reset)
- `/swarm checkpoint list` — List all checkpoints with timestamps
- `/swarm checkpoint delete [label]` — Remove a checkpoint

**Configuration:** No configuration required.

#### New: Delegation Envelope Types (`src/types/delegation.ts`)
Formal `DelegationEnvelope` interface for typed agent-to-agent task delegation, with `parseDelegationEnvelope()` for safe extraction from message content.

### Additions to Existing Modules

* `src/hooks/delegation-gate.ts` — Added `parseDelegationEnvelope()` export used by the role-scoped context filter
* `src/hooks/knowledge-store.ts` — Added `getPlatformConfigDir()` export for cross-platform config path resolution (Windows: `%LOCALAPPDATA%\opencode-swarm\config`, macOS: `~/Library/Application Support/opencode-swarm`, Linux: `~/.config/opencode-swarm`)

### Upgrade Notes

No breaking changes. All new modules are additive. Existing `plugin.config.ts` configurations are fully compatible with v6.20.0.

## [6.19.8](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.7...v6.19.8) (2026-03-06)


### Bug Fixes

* add handoff command, run memory service, and context budget guard ([efa334c](https://github.com/zaxbysauce/opencode-swarm/commit/efa334cd2e6435eda93176f3f3325a6e1d21d895))
* add handoff command, run memory, and context budget guard ([1118edb](https://github.com/zaxbysauce/opencode-swarm/commit/1118edbac57535eb83552251adb8eddffc264cca))

## [6.19.7](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.6...v6.19.7) (2026-03-06)


### Bug Fixes

* **dist:** rebuild dist artifacts for update_task_status and write_retro tool additions ([03eb93a](https://github.com/zaxbysauce/opencode-swarm/commit/03eb93ac5bb5ef096bcb3a339cfb3351358abb27))
* expose update_task_status and write_retro tools, repair retro compatibility ([ec96421](https://github.com/zaxbysauce/opencode-swarm/commit/ec964215369bae5226e2c0cbb0abf46fce37e485))
* **tests:** correct phase_complete adversarial test expectations for RETROSPECTIVE_MISSING behavior ([bc0383f](https://github.com/zaxbysauce/opencode-swarm/commit/bc0383ff14577e4f4fd18152d001c6c41c5500bf))
* **tools:** expose update_task_status and write_retro, repair retro compatibility, harden architect prompt ([694dd16](https://github.com/zaxbysauce/opencode-swarm/commit/694dd1656bd34dc5ffbfac71c0587bd898c6b9a0))

## [6.19.6](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.5...v6.19.6) (2026-03-06)


### Bug Fixes

* **ci:** remove native tree-sitter devDeps that compiled from source on Windows ([9138137](https://github.com/zaxbysauce/opencode-swarm/commit/9138137309f81ae2ac4c2287f7da436d4f5446a7))
* harden pre_check_batch, diff, glob, placeholder-scan, and sast-scan ([11c40f5](https://github.com/zaxbysauce/opencode-swarm/commit/11c40f5a1d4886a9c88c2403b563a74c6a5a8dda))
* **lint:** resolve 5 biome errors introduced by Phase 1-4 hardening ([9dacdf3](https://github.com/zaxbysauce/opencode-swarm/commit/9dacdf360db80c4fb0e4bfd4e42d6dbde6ceb701))
* tool hardening and Windows CI native-dep removal ([e6155e0](https://github.com/zaxbysauce/opencode-swarm/commit/e6155e09bed9705c1970c6b0d61b16ef6b24d804))

## [6.19.5](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.4...v6.19.5) (2026-03-06)


### Bug Fixes

* phase completion reliability and workspace validation hardening ([4051d14](https://github.com/zaxbysauce/opencode-swarm/commit/4051d14b71d5f5cce5b8f479c534eac8817d436a))
* phase completion reliability and workspace validation hardening ([600e9bb](https://github.com/zaxbysauce/opencode-swarm/commit/600e9bb158e98f30e375ce784271f561492bcf98))

## [6.19.4](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.3...v6.19.4) (2026-03-05)


### Bug Fixes

* **lint:** remove CI-blocking biome errors in hooks ([3e8fe80](https://github.com/zaxbysauce/opencode-swarm/commit/3e8fe80bad25c2c4df6758c98798b7b4ac45ebe7))

## [6.19.3](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.2...v6.19.3) (2026-03-04)


### Bug Fixes

* **architect:** tier QA gates to reduce low-risk churn ([5e38b05](https://github.com/zaxbysauce/opencode-swarm/commit/5e38b05a492c72b823abf17874a155c9d74618aa))

## [6.19.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.1...v6.19.2) (2026-03-04)


### Bug Fixes

* **build:** remove misplaced src test artifact breaking declarations ([3bee31e](https://github.com/zaxbysauce/opencode-swarm/commit/3bee31ea841b6af5773478f2c514892666be10bb))

## [6.19.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.19.0...v6.19.1) (2026-03-04)


### Bug Fixes

* **release:** realign release-please baseline to v6.19.0 ([02c505a](https://github.com/zaxbysauce/opencode-swarm/commit/02c505a0aa73aca0c9a96c288f04dc6d3cbdedf2))

## [6.19.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.18.1...v6.19.0) (2026-03-04)


### Features

* v6.19.0 — Prompt-Quality & Adversarial Robustness Update ([0fdf2e8](https://github.com/zaxbysauce/opencode-swarm/commit/0fdf2e818846a0f2c66b8ff42cd650b8d923f0c1))

## v6.19.0 — Prompt-Quality & Adversarial Robustness Update

### Added
- **Critic Sounding Board mode** — Architect consults critic before escalating to user (UNNECESSARY/REPHRASE/APPROVED/RESOLVE verdicts)
- **Architect Escalation Discipline** — Three-tier escalation hierarchy (self-resolve → critic → user)
- **Adversarial detector patterns** — PRECEDENT_MANIPULATION, SELF_REVIEW, CONTENT_EXEMPTION, GATE_DELEGATION_BYPASS, VELOCITY_RATIONALIZATION
- **Intent reconstruction in mega-reviewer** — Reconstructs developer intent before evaluating changes
- **Complexity-scaled review depth** — TRIVIAL/MODERATE/COMPLEX classification determines review thoroughness
- **SME confidence-gated routing** — Architect routes LOW-confidence results to second opinion or user flag
- **meta.summary convention** — Agents include one-line summaries in state events for downstream consumption
- **Role-relevance tagging** — Agents tag outputs with [FOR: agent1, agent2] for future context filtering
- **Cross-agent verbosity controls** — Response length scales to finding complexity

### Improved
- **Critic DRIFT-CHECK** with trajectory-level evaluation, first-error focus, anti-rubber-stamp bias
- **Mega-reviewer three-tier review structure** (correctness → safety → quality)
- **SME confidence levels and staleness awareness**

### Added (Hotfix)
- **Coder self-audit checklist** — Pre-completion verification
- **Gate authority block** — Architect cannot self-judge task completion
- **Retry circuit breaker** — Architect intervenes after 3 coder rejections to simplify approach
- **Spec-writing discipline for destructive operations** — Mandatory error strategy, message accuracy, platform compatibility
- **SME platform awareness** — Cross-platform verification required for OS-interaction APIs

### JSONL Events
- `sounding_board_consulted` — Every sounding board invocation
- `architect_loop_detected` — Third occurrence of same impasse
- `precedent_manipulation_detected` — Highest-severity adversarial pattern
- `coder_self_audit` — End of every task
- `coder_retry_circuit_breaker` — Coder task rejected 3 times


## [6.18.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.18.0...v6.18.1) (2026-03-04)


### Bug Fixes

* retrospective schema mismatch — write_retro tool + /swarm write-retro command (v6.18.1) ([406a635](https://github.com/zaxbysauce/opencode-swarm/commit/406a6355648d5cfb1965d78fdc1f6c11370b01dd))

## [6.18.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.17.3...v6.18.0) (2026-03-04)


### Features

* robustness, discoverability & intelligence expansion (v6.18.0) ([f5fd2ef](https://github.com/zaxbysauce/opencode-swarm/commit/f5fd2ef7667165101aeaa76fd8b2209193c79ad3))

## [6.17.3](https://github.com/zaxbysauce/opencode-swarm/compare/v6.17.2...v6.17.3) (2026-03-03)


### Bug Fixes

* diagnostic signal fidelity — warn→log reclassification and loadEvidence discriminated union (v6.17.3) ([986eed5](https://github.com/zaxbysauce/opencode-swarm/commit/986eed540328eb0803d70fdf9e7b61ebef22839a))

## [6.17.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.17.1...v6.17.2) (2026-03-03)


### Bug Fixes

* add bunx run subcommand for out-of-session plugin invocation (v6.17.2) ([847b0e4](https://github.com/zaxbysauce/opencode-swarm/commit/847b0e489f77370d64ea070739a5828732636a19))

## [6.17.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.17.0...v6.17.1) (2026-03-03)


### Bug Fixes

* wire knowledge migrate command, retrieval outcomes, and dark matter persistence (v6.17.1) ([98ce920](https://github.com/zaxbysauce/opencode-swarm/commit/98ce920dee309ba61aa8f92bb8a5d5ed4a5fb1ec))

## [6.17.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.16.1...v6.17.0) (2026-03-03)


### Features

* add two-tier cross-project knowledge base (v6.17.0) ([6f0e90d](https://github.com/zaxbysauce/opencode-swarm/commit/6f0e90d8aea5590d1fc1f613b5a894667a931779))

## [6.16.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.16.0...v6.16.1) (2026-03-02)


### Bug Fixes

* add spec lifecycle fixes — explicit override, stale detection, archival, plan ingestion gate (v6.16.1) ([6c94b6c](https://github.com/zaxbysauce/opencode-swarm/commit/6c94b6c3e00826af59dab961cfe15c5bf72ca436))

## [6.16.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.15.0...v6.16.0) (2026-03-02)

### Features

* **Multi-Language Support (11 languages, 3 tiers)** — Language profile abstraction in `src/lang/profiles.ts` covering TypeScript/JS, Python, Rust, Go (Tier 1), Java, Kotlin, C#/.NET, C/C++, Swift (Tier 2), Dart/Flutter, Ruby (Tier 3)
* **Profile-driven build detection** — `discoverBuildCommandsFromProfiles()` in `src/build/discovery.ts` picks highest-priority build binary per language profile; existing detection preserved as fallback
* **Profile-driven test framework detection** — 9 new detect functions in `src/tools/test-runner.ts`; 16 frameworks total (Go, Java/Maven, Java/Gradle, Kotlin, C#, CMake/ctest, Swift, Dart, Ruby RSpec/minitest)
* **Profile-driven lint detection** — `detectAdditionalLinter()` in `src/tools/lint.ts`; 10 detector functions (golangci-lint, Checkstyle, ktlint, dotnet-format, cppcheck, swiftlint, dart analyze, RuboCop, scalafmt, buf)
* **Package audit expansion** — govulncheck (Go), dotnet list package (C#), bundle-audit (Ruby), dart pub outdated (Dart) in `src/tools/pkg-audit.ts`; all 7 auditors normalized to unified result format
* **Semgrep SAST integration** — profile-driven language dispatch in `src/tools/sast-scan.ts`; auto-mode (`semgrep --config auto --lang`) for languages without native rulesets; soft warning when semgrep binary absent
* **Language-aware prompt injection** — coder and reviewer agents receive language-specific constraints and review checklists from task file paths via `getProfileForFile()` in `src/hooks/system-enhancer.ts`; both Path A and Path B inject for coder + reviewer
* **New Tree-sitter grammars** — Kotlin, Swift, Dart WASM grammars vendored in `src/lang/grammars/`; `LANGUAGE_WASM_MAP` updated in `src/lang/runtime.ts`
* **Graceful degradation** — all profile-driven tools skip with a soft warning when required binary is not on PATH; never a hard gate failure
* **200+ new tests** — `tests/unit/lang/`, `tests/integration/lang/`, `tests/unit/tools/`, `tests/unit/hooks/` covering profiles, detector, tool integration, and prompt injection

## [6.15.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.12...v6.15.0) (2026-03-02)


### Features

* add requirements-driven planning pipeline (v6.15.0) ([c2b6262](https://github.com/zaxbysauce/opencode-swarm/commit/c2b6262b62ebaa77b96fee13bae86b84f41576aa))

## [6.15.0](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.12...v6.15.0) (2026-03-02)

### Features

* SPECIFY mode for Architect — generate structured requirement specs (FR-###, SC-###) from feature descriptions (src/agents/architect.ts)
* CLARIFY-SPEC mode for Architect — resolve spec ambiguities one question at a time, max 8 questions (src/agents/architect.ts)
* Soft Spec Gate in PLAN mode — warns when planning without a spec and offers to create one or skip (src/agents/architect.ts)
* ANALYZE mode for Critic — audit plans against specs for gaps and gold-plating with FR-### coverage table (src/agents/critic.ts)
* DRIFT-CHECK mode for Critic — automatic requirement drift detection at phase boundaries in PHASE-WRAP (src/agents/critic.ts, src/agents/architect.ts)
* Project Governance — auto-detect MUST/SHOULD rules from project-instructions.md in DISCOVER mode (src/agents/architect.ts)
* Research Caching for SME — cache external URL lookups in context.md ## Research Sources to avoid redundant fetches (src/agents/sme.ts)
* External plan import path in SPECIFY mode — reverse-engineer spec from existing plan and validate task format (src/agents/architect.ts)
* New commands: /swarm specify, /swarm clarify, /swarm analyze (src/commands/specify.ts, src/commands/clarify.ts, src/commands/analyze.ts)
* Automated release notes pipeline — update-release-notes CI job populates GitHub release body from docs/releases/{tag}.md (.github/workflows/release-and-publish.yml)

## [6.14.12](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.11...v6.14.12) (2026-03-02)


### Bug Fixes

* harden context enforcement and stabilize cross-platform CI ([7e4cf0a](https://github.com/zaxbysauce/opencode-swarm/commit/7e4cf0a513e5dc1cd13ff3f7645d25a1942a9e2c))

## [6.14.12](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.11...v6.14.12) (2026-03-02)

### Features

* Hard context enforcement with priority pruning and agent‑switch reset (src/hooks/context-budget.ts)
* Provider‑aware model limit resolution (src/hooks/model-limits.ts)
* Message priority classification tiers (src/hooks/message-priority.ts)
* Windows absolute path validation in utils (src/hooks/utils.ts)
* CI test timeout safeguard to prevent hangs ( .github/workflows/ci.yml )

### Bug Fixes

* Guardrails fixes for delegation and self‑coding detection
* Minor stability improvements

## [6.14.11](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.10...v6.14.11) (2026-03-01)


### Bug Fixes

* add token fallback when OIDC publish fails ([549131d](https://github.com/zaxbysauce/opencode-swarm/commit/549131d4e0efeabb986e851191ef9dbb95f72d86))

## [6.14.10](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.9...v6.14.10) (2026-03-01)


### Bug Fixes

* force npm trusted publish via OIDC-only auth path ([199dbb5](https://github.com/zaxbysauce/opencode-swarm/commit/199dbb5026d35b76a39c22450115db4804495511))

## [6.14.9](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.8...v6.14.9) (2026-03-01)


### Bug Fixes

* use minimal npm trusted publisher workflow config ([d014a0c](https://github.com/zaxbysauce/opencode-swarm/commit/d014a0c7f415b871a0e4b6206e6489090f90edde))

## [6.14.8](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.7...v6.14.8) (2026-03-01)


### Bug Fixes

* clear setup-node auth token before npm trusted publish ([53ee183](https://github.com/zaxbysauce/opencode-swarm/commit/53ee183c2aedae0d3652119a01008e20f4641fbf))

## [6.14.7](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.6...v6.14.7) (2026-03-01)


### Bug Fixes

* set npm environment on publish job for trusted publisher OIDC ([c47b8e6](https://github.com/zaxbysauce/opencode-swarm/commit/c47b8e6975e96d45775bbcb51bb8646bc9b99fee))

## [6.14.6](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.5...v6.14.6) (2026-03-01)


### Bug Fixes

* suppress GITHUB_TOKEN injection in setup-node for OIDC npm publish ([923565c](https://github.com/zaxbysauce/opencode-swarm/commit/923565ca1a57c31b34be23610bb89c5c825502dc))

## [6.14.5](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.4...v6.14.5) (2026-03-01)


### Bug Fixes

* restore registry-url to setup-node to enable OIDC npm publish ([7d47e97](https://github.com/zaxbysauce/opencode-swarm/commit/7d47e97312c7091f6869fac60398c138928d13d5))

## [6.14.4](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.3...v6.14.4) (2026-03-01)


### Bug Fixes

* remove registry-url from setup-node to unblock OIDC npm publish ([3d17561](https://github.com/zaxbysauce/opencode-swarm/commit/3d1756154827fee6f0db22ec67fafbaab812e916))

## [6.14.3](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.2...v6.14.3) (2026-03-01)


### Bug Fixes

* switch publish-npm to OIDC trusted publishing (remove NPM_TOKEN, add provenance) ([5cfa728](https://github.com/zaxbysauce/opencode-swarm/commit/5cfa728537c1f07eb5d7d6475fee96f44e9d5764))

## [6.14.2](https://github.com/zaxbysauce/opencode-swarm/compare/v6.14.1...v6.14.2) (2026-03-01)


### Bug Fixes

* declare js-yaml devDependency and harden CI/publish workflows ([30e7fdf](https://github.com/zaxbysauce/opencode-swarm/commit/30e7fdf89a1b50ab3b7289023f0e1844b10d88c5))
* remove matrix false positive from ci-workflow-security expression injection check ([9950a40](https://github.com/zaxbysauce/opencode-swarm/commit/9950a40cbcaa9c5e4f511e8541812dff89f8c3c4))

## [6.13.4](https://github.com/zaxbysauce/opencode-swarm/compare/v6.13.3...v6.13.4) (2026-03-01)


### Features

* v6.13.3 retrospective enforcement & memory improvements ([3ce66cd](https://github.com/zaxbysauce/opencode-swarm/commit/3ce66cd3d2c5319a21682b5a42b8ca103fa3ca26))


### Bug Fixes

* add null guard in system-enhancer adversarial afterEach before rmSync ([af49674](https://github.com/zaxbysauce/opencode-swarm/commit/af49674fc2652197cc5c4e9916994faddb028dc0))
* resolve 10 pre-existing syntax-check test failures ([3460a34](https://github.com/zaxbysauce/opencode-swarm/commit/3460a34bc6b6db5aa83837b7e461a28012c9734e))
* stop test-plan-sync dirs leaking into project root ([c84cad0](https://github.com/zaxbysauce/opencode-swarm/commit/c84cad0d4675fdf2fd285c88ec03fe4d91d8aab8))
* use os.tmpdir() in tests to prevent temp dirs leaking into project root ([b32a0e1](https://github.com/zaxbysauce/opencode-swarm/commit/b32a0e103306b36fe6fafd0a8a3d2c893314b59b))

## [6.13.3] - 2026-02-28

### Bug Fixes
- **Retrospective gate:** `phase_complete` now requires a retrospective evidence bundle
  before allowing phase completion. Agents can no longer skip retrospectives.
- **Phase-scoped retro injection:** System enhancer now reads the previous phase's
  retrospective by phase number (not random recent file) and always injects lessons —
  not just when `reviewer_rejections > 2`.
- **Deduplicated retro logic:** Extracted shared retrospective injection function from
  duplicated Path A / Path B code in system-enhancer.ts.

### Improvements
- **User directive capture:** New `user_directives` field in RetrospectiveEvidence schema
  captures user corrections with category and persistence scope.
- **Approach tracking:** New `approaches_tried` field tracks what was attempted and why
  approaches were abandoned, enabling future trajectory mining.
- **Pre-phase briefing:** Architect prompt now requires reading previous phase retrospective
  and printing a briefing acknowledgment before starting any new phase.
- **Coder retro injection:** Coder agent now receives condensed lessons_learned from the
  previous phase's retrospective.
- **Cross-project memory:** Phase 1 of any project now receives historical lessons from
  up to 3 recent retrospectives from prior projects in the same workspace, including
  carried-forward user directives.
- **Phase count guidance:** Architect prompt now discourages single-phase plans for large
  task sets (5+ tasks → 2+ phases, 10+ tasks → 3+ phases).
- **Plan ID tagging:** Retrospectives now include `plan_id` in metadata for reliable
  cross-project vs. same-plan filtering.

## [6.13.2] - 2026-02-28

### Added
- **`phase_complete` tool**: New enforcement gate that verifies all required agents (coder, reviewer, test_engineer) were dispatched before a phase completes. Emits structured `PhaseCompleteEvent` to `.swarm/events.jsonl`, resets per-phase dispatch tracking, and blocks or warns based on configurable policy (`enforce`/`warn`).
- **`exempt_tools` config**: `SummaryConfigSchema` now supports `exempt_tools` (default: `['retrieve_summary','task']`) to prevent summarization loops — outputs from those tools are never summarized.
- **Same-model adversarial detection**: New `AdversarialDetectionConfigSchema` and `src/hooks/adversarial-detector.ts`. Detects when coder and reviewer share the same underlying model and injects a warning or policy escalation into the reviewer's system prompt. Supports `warn`, `gate`, and `ignore` policies.
- **Swarm Briefing doc**: `docs/swarm-briefing.md` — 95-line LLM-readable pipeline briefing covering the 12-step pipeline, task format table, sizing rules, and example tasks.
- **Task Field Reference**: Inserted `## Task Field Reference` into `docs/planning.md` with FILE/TASK/CONSTRAINT/AC definitions, Good/Bad examples, and SMALL/MEDIUM/LARGE sizing guidance.

### Fixed
- **HF-1b — Architect test execution guardrail**: Architect agents now receive an injection preventing bulk `bun test` runs. Only specific test files for code modified in-session may be run, one at a time. Resolves crash-on-concurrent-test-run issue.
- **HF-1 scope refactor**: `baseRole` declaration hoisted out of block scope so it is shared between the HF-1 (coder/test_engineer no-verify) and HF-1b (architect no-bulk-test) guardrail blocks.

### Tests
- 46 new tests for HF-1b guardrails (`system-enhancer-hf1b.test.ts`, `system-enhancer-hf1b-adversarial.test.ts`)
- 400 tests across 17 files for Phases 1–4 (phase_complete, summarization loop, adversarial detection, docs)

## [6.12.1](https://github.com/zaxbysauce/opencode-swarm/compare/v6.12.0...v6.12.1) (2026-02-28)


### Bug Fixes

* TypeScript errors from optional current_phase ([284bc5f](https://github.com/zaxbysauce/opencode-swarm/commit/284bc5f574ef87210063c0bc8abe3fcd165b5886))

## [6.13.1] - 2026-02-28

### Added
- **consolidateSystemMessages** utility to merge multiple system messages into one at index 0.
- **Test isolation helpers** `createIsolatedTestEnv` and `assertSafeForWrite`.
- Migration for v6.12 presets-format configs (in‑memory, with warning).

### Fixed
- `/swarm` command template: `{{arguments}}` → `$ARGUMENTS` with LLM no‑op instruction.
- `install()` default config: preset/presets schema → agents schema.
- DEFAULT_MODELS updates: `claude-sonnet-4-5` → `claude-sonnet-4-20250514`, `gemini-2.0-flash` → `gemini-2.5-flash`.

### Tests
- 20 new tests for consolidation utility.
- 14 new tests for isolation helper.

## [6.13.0] - 2026-02-28

### Added
- **Role-Scoped Tool Filtering**: AGENT_TOOL_MAP in src/config/constants.ts
  - Architect gets all 17+ tools
  - Other agents capped at 12 tools
  - Config option: tool_filter.enabled/overrides

- **Plan Cursor**: Compressed plan summary under 1,500 tokens
  - extractPlanCursor in src/hooks/extractors.ts
  - Priority 1 injection in system-enhancer
  - Config: plan_cursor.enabled/max_tokens/lookahead_tasks

- **Mode-Conditional System Injection**: detectArchitectMode in src/hooks/system-enhancer.ts
  - DISCOVER/PLAN/EXECUTE/PHASE-WRAP/UNKNOWN modes
  - DISCOVER mode suppresses: Plan Cursor, Decisions, Agent Context, Drift, Pre-Check
  - Phase Header always injects

- **Tool Output Truncation**: truncateToolOutput in src/utils/tool-output.ts
  - Config: tool_output.truncation_enabled/max_lines/per_tool
  - Only diff/symbols tools truncated by default
  - Footer with omitted lines count and retrieval guidance

- **ZodError Fixes**: src/config/plan-schema.ts
  - current_phase now optional with inference fallback
  - PhaseStatusSchema accepts both 'complete' and 'completed'
  - loadPlan guarded with try-catch in system-enhancer

### Tests
- 209 new tests across 6 test files

## [6.12.0] - 2026-02-27

### Added
- **Anti-Process-Violation Hardening**: Runtime detection hooks to catch architect workflow violations
  - Self-coding detection: Warns when architect uses write/edit tools directly instead of delegating to mega_coder
  - Gate tracking: Detects partial QA gate execution (skipping gates)
  - Self-fix detection: Warns when same agent fixes its own gate failure within 2 minutes
  - Batch detection: Detects "implement X and add Y" batching in delegation requests
  - Zero-coder-delegation detection: Catches when tasks complete without any coder delegation
  - Catastrophic violation warning: Warns when Phase >= 4 has zero reviewer calls

- **New state tracking fields** in `AgentSessionState`:
  - `architectWriteCount`: Tracks architect's direct code edits
  - `gateLog`: Tracks which QA gates have run
  - `reviewerCallCount`: Tracks mega_reviewer delegations
  - `lastGateFailure`: Records last failed gate for self-fix detection
  - `selfFixAttempted`: Flag for self-fix detection
  - `partialGateWarningIssued`: Dedup for partial gate warnings
  - `catastrophicPhaseWarnings`: Set of phases with catastrophic warnings
  - `lastCoderDelegationTaskId`: Tracks last delegated task for zero-delegation detection

- **Pipeline-tracker compliance escalation**: Phase >= 4 now includes explicit compliance reminders

### Changed
- **Architect prompt hardening**: Added 11 new enforcement blocks to the architect agent prompt:
  - ANTI-SELF-CODING RULES with concrete ✗/✓ rationalization examples
  - Tool-usage boundary clarifying Rule 1 (DELEGATE all coding)
  - Self-coding pre-check in Rule 4 fallback
  - PARTIAL GATE RATIONALIZATIONS anti-pattern list
  - ⛔ TASK COMPLETION GATE hard-stop checklist
  - precheckbatch SCOPE BOUNDARY (Stage A gates only)
  - Rule 7 STAGE A / STAGE B restructure
  - CATASTROPHIC VIOLATION CHECK for zero-reviewer scenarios
  - GATE FAILURE RESPONSE RULES with structured rejection format
  - Rule 3 BATCHING DETECTION + split requirement
  - RETRY PROTOCOL with resume-at-step instruction

- **Delegation gate enhanced**: Batch detection now catches 8 patterns including verb+and+verb, "while you're at it", and compound task descriptions

### Fixed
- **Path traversal in `isOutsideSwarmDir`**: Now uses `path.resolve()` and `path.relative()` for proper normalization instead of simple prefix check (fixes `.swarm/../src/evil.ts` bypass)
- **Lint errors across codebase**: Fixed 30+ lint errors in checkpoint.ts, test-runner.ts, pkg-audit.ts, placeholder-scan.ts, syntax-check.ts, trigger.ts

### Security
- **Path traversal bypass fixed**: The `isOutsideSwarmDir` function in `guardrails.ts` now correctly detects traversal attempts like `.swarm/../src/evil.ts`, `../.swarm/../../etc/passwd`, and URL-encoded variants
- **135 adversarial security tests**: Comprehensive coverage of path traversal, prototype pollution, state mutation, gate bypass, and batch detection evasion attacks

### Tests
- **487 new v6.12 tests** across 8 test files:
  - `self-coding-detection.test.ts`: 40+ tests for self-coding, batch, self-fix detection
  - `gate-tracking.test.ts`: Gate tracking, reviewer count, delegation violation tests
  - `guardrails-catastrophic-warning.test.ts`: Catastrophic warning injection, deduplication, edge cases
  - `guardrails-v612-adversarial.test.ts`: Circuit breaker, config tampering, state pollution attacks
  - Plus updates to existing test files for new hook behaviors
- **34 new path traversal adversarial tests** in `guardrails-pathtraversal-adversarial.test.ts`

---

## v6.11.1 - Packaging Fix (2026-02-27)

### Fixes

- Remove `postinstall` hook to avoid Bun dependency during npm global install
- Grammars are bundled via `bun run build` into `dist/lang/grammars`

## v6.11.0 - Architect Prompt Hardening (2026-02-26)

### Workflow Hardening

#### MODE Labels — Clear Architect Workflow Phases
Renamed internal workflow headers from "Phase N" to explicit MODE labels:
- `MODE: RESUME` — Resume detection
- `MODE: CLARIFY` — Requirement clarification
- `MODE: DISCOVER` — Codebase exploration
- `MODE: CONSULT` — SME consultation
- `MODE: PLAN` — Plan creation
- `MODE: CRITIC-GATE` — Plan review checkpoint
- `MODE: EXECUTE` — Task implementation
- `MODE: PHASE-WRAP` — Phase completion

**NAMESPACE RULE**: MODE labels refer to architect's internal workflow. Project plan phases remain "Phase N" in plan.md.

#### ⛔ HARD STOP — Pre-Commit Checklist
Mandatory 4-item checklist before marking any task complete:
- [ ] All QA gates passed (lint:check, secretscan, sast_scan)
- [ ] Reviewer approval documented
- [ ] Tests pass with evidence
- [ ] No security findings

There is no override. A commit without a completed QA gate is a workflow violation.

#### Observable Output — Required Print Statements
All blocking steps (5c-5m) now require explicit output:
```
→ REQUIRED: Print {description} on all blocking steps
```
Ensures visibility into gate progress and failure points.

### Task Quality Enforcement

#### Task Granularity Rules
Tasks classified as SMALL/MEDIUM/LARGE with decomposition requirements:
- **SMALL**: 1 file, single verb, <2 hours
- **MEDIUM**: 1-2 files, compound action, <4 hours
- **LARGE**: Must decompose into smaller tasks

#### Task Atomicity Checks
Critic validates tasks are not oversized:
- Max 2 files per task (otherwise decompose)
- No compound verbs ("and", "plus", "with") in task descriptions
- Clear acceptance criteria required

#### TASK COMPLETION CHECKLIST
Emit before marking task complete:
- Evidence written to `.swarm/evidence/{taskId}/`
- plan.md updated with `[x] task complete`
- Completion confirmation printed

### Failure Handling

#### FAILURE COUNTING
Retry counter with escalation after 5 failures:
```
RETRY #{count}/5
```

#### RETRY PROTOCOL
Structured rejection format on gate failure:
```
RETRY #{count}/5
FAILED GATE: {gate_name}
REASON: {specific failure}
REQUIRED FIX: {actionable instruction}
RESUME AT: {step_5x}
```

### Anti-Rationalization

#### ANTI-EXEMPTION RULES (8 patterns blocked)
The following rationalizations are explicitly blocked:
1. "It's a simple change"
2. "Just updating docs"
3. "Only a config tweak"
4. "Hotfix, no time for QA"
5. "The tests pass locally"
6. "I'll clean it up later"
7. "No logic changes"
8. "Already reviewed the pattern"

There are NO simple changes. There are NO exceptions to the QA gate sequence.

### Security

#### AUTHOR BLINDNESS WARNING
Added to coder prompt: warns against self-review bias and requires treating own code with same scrutiny as others'.

### Updated Phase 5 QA Gate Sequence

```
coder → diff → syntax_check → placeholder_scan → imports → 
lint fix → build_check → pre_check_batch (4 parallel: lint:check, secretscan, sast_scan, quality_budget) → 
reviewer → security review → verification tests → adversarial tests → coverage check → complete
```

**Note**: `secretscan` and `sast_scan` now run inside `pre_check_batch`, not as standalone steps.

### Files Changed
- `src/agents/architect.ts` — MODE labels, HARD STOP, observable output, anti-exemption rules
- `src/agents/critic.ts` — Task granularity checks, atomicity validation
- `src/agents/coder.ts` — Author blindness warning
- `tests/unit/agents/architect-gates.test.ts` — Gate sequence tests
- `tests/unit/agents/architect-v6-prompt.test.ts` — Prompt structure validation
- `tests/unit/agents/architect-workflow-security.test.ts` — Security gate tests
- `tests/unit/agents/architect-adversarial.test.ts` — Anti-rationalization tests

---

## v6.10.0 - Parallel Pre-Check Batch (2026-02-26)

### New Features

#### pre_check_batch - Parallel Verification Tooling

**4x faster QA gates** by running independent checks in parallel:

- **lint:check** - Code quality verification (hard gate)
- **secretscan** - Secret detection (hard gate)  
- **sast_scan** - Static security analysis with 63+ rules (hard gate)
- **quality_budget** - Maintainability threshold enforcement

**Benefits**:
- Reduces total gate time from ~60s (sequential) to ~15s (parallel)
- All tools run via `p-limit` with max 4 concurrent operations
- Individual tool timeouts (60s) prevent cascading failures
- Unified `gates_passed` boolean for simplified gate logic

### New Configuration

```json
{
  "pipeline": {
    "parallel_precheck": true  // default: true
  }
}
```

Set to `false` to run gates sequentially (useful for debugging or resource constraints).

### Updated Phase 5 QA Gate Sequence

```
coder → diff → syntax_check → placeholder_scan → imports → 
lint fix → build_check → pre_check_batch (parallel) → 
reviewer → security reviewer → test_engineer → coverage check
```

### System Hints

Architect receives hints about parallel vs sequential mode via system enhancer hook. Phase 5 prompt updated to use `pre_check_batch` after `build_check`.

### Dependencies

- Added `p-limit@7.3.0` for concurrency control

### Upgrade Guide

**No breaking changes.**

1. Update to v6.10.0
2. Parallel pre-check enabled by default
3. Set `pipeline.parallel_precheck: false` to disable if needed
4. Run `bun test` to verify installation

---

## v6.9.0 - Quality & Anti-Slop Tooling (2026-02-25)

### New Features

#### syntax_check - Tree-sitter Parse Validation
- Validates syntax across 9+ languages (JS/TS, Python, Go, Rust, Java, PHP, C, C++, C#)
- Uses Tree-sitter parsers for accurate error detection
- Runs before all other gates to catch syntax errors early

#### placeholder_scan - Anti-Slop Detection
- Detects TODO/FIXME/TBD/XXX comments in production code
- Identifies placeholder text and stub implementations
- Prevents shipping incomplete or "sloppy" code
- Configurable allow_globs for docs/tests directories

#### sast_scan - Static Security Analysis
- 63+ offline security rules across 9 languages
- High-signal, low false-positive detection
- Tier A: Built-in rules (always available)
- Tier B: Optional Semgrep integration (if on PATH)
- Rules cover: eval, command injection, deserialization, buffer overflow, etc.

#### sbom_generate - Dependency Tracking
- Generates CycloneDX v1.5 SBOMs
- Supports 8 ecosystems: Node.js, Python, Rust, Go, Java, .NET, Swift, Dart
- Parses lock files: package-lock.json, Cargo.lock, poetry.lock, go.sum, etc.
- Non-blocking evidence collection

#### build_check - Build Verification
- Runs repo-native build/typecheck commands
- Supports 10+ ecosystems with automatic detection
- Graceful skip when toolchain unavailable
- Captures build output for debugging

#### quality_budget - Maintainability Enforcement
- Enforces 4 quality metrics:
  - Complexity delta (cyclomatic complexity)
  - Public API delta (new exports)
  - Duplication ratio (copy-paste detection)
  - Test-to-code ratio (coverage proxy)
- Configurable thresholds per project
- Integrated with `/swarm benchmark --ci-gate`

### New Evidence Types
- `syntax` - Syntax check results
- `placeholder` - Placeholder scan findings
- `sast` - Security analysis findings
- `sbom` - Software Bill of Materials
- `build` - Build verification results
- `quality_budget` - Quality metrics and violations

### Configuration

New `gates` config section in `.opencode/swarm.json`:

```json
{
  "gates": {
    "syntax_check": { "enabled": true },
    "placeholder_scan": { "enabled": true },
    "sast_scan": { "enabled": true },
    "sbom_generate": { "enabled": true },
    "build_check": { "enabled": true },
    "quality_budget": {
      "enabled": true,
      "max_complexity_delta": 5,
      "max_public_api_delta": 10,
      "max_duplication_ratio": 0.05,
      "min_test_to_code_ratio": 0.3
    }
  }
}
```

### Complete QA Gate Sequence

```
coder → diff → syntax_check → placeholder_scan → imports → 
lint → secretscan → sast_scan → build_check → quality_budget → 
reviewer → security reviewer → test_engineer → coverage check
```

### Local-Only Guarantee

All v6.9.0 quality tools run **locally** without:
- Docker containers
- Network connections
- External APIs
- Cloud services

Optional enhancement: Semgrep (only if already installed on PATH)

### Upgrade Guide

**No breaking changes.**

1. Update to v6.9.0
2. New gates are enabled by default
3. Configure thresholds in `.opencode/swarm.json` (optional)
4. Run `bun test` to verify installation

### Stats
- 6 new tools
- 6 new evidence types
- 12 total evidence types
- 1,100+ tests passing
- 63 SAST rules
- 11 supported languages

---

## Previous Versions

### v6.8.x
- Evidence system
- Benchmark suite
- CI gate
