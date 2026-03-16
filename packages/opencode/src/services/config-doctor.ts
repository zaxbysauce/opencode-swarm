// Bridge module - re-exports from core services config-doctor
export {
	applySafeAutoFixes,
	type ConfigBackup,
	type ConfigDoctorResult,
	type ConfigFinding,
	type ConfigFix,
	createConfigBackup,
	type FindingSeverity,
	getConfigPaths,
	runConfigDoctor,
	runConfigDoctorWithFixes,
	shouldRunOnStartup,
	writeBackupArtifact,
	writeDoctorArtifact,
} from '@opencode-swarm/core';
