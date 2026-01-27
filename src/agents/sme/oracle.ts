import type { SMEDomainConfig } from './base';

export const oracleSMEConfig: SMEDomainConfig = {
	domain: 'oracle',
	description: 'Oracle Database administration and SQL/PLSQL',
	guidance: `For Oracle tasks, provide:
- Correct SQL syntax for Oracle (not MySQL/SQL Server)
- PL/SQL block structure and exception handling
- CDB/PDB architecture considerations
- Parameter names and valid values (init.ora, spfile)
- Required privileges and roles (DBA, SYSDBA, specific grants)
- Data dictionary views (DBA_*, ALL_*, USER_*, V$*, GV$*)
- RMAN commands and syntax
- TNS configuration and connectivity (tnsnames.ora, listener.ora)
- Oracle-specific functions (NVL, DECODE, LISTAGG, etc.)
- Bind variable usage for performance
- Transaction handling (COMMIT, ROLLBACK, savepoints)
- LOB handling (CLOB, BLOB operations)
- Date/timestamp handling (TO_DATE, TO_TIMESTAMP, NLS settings)
- Execution plan analysis (EXPLAIN PLAN, hints)`,
};
