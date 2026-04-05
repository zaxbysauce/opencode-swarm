/**
 * SAST Laravel-specific rule tests
 * Testing Task 3.4: Laravel baseline detection and commands
 */

import { describe, expect, it } from 'bun:test';
import { executeRulesSync } from '../../../src/sast/rules/index';

describe('SAST Laravel Rules', () => {
	describe('sast/php-laravel-sql-injection', () => {
		const ruleId = 'sast/php-laravel-sql-injection';

		it('should fire on DB::raw with string concatenation', () => {
			const code = `<?php
$users = DB::table('users')->whereRaw('name = ' . $name)->get();
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should fire on ->whereRaw with string concatenation', () => {
			const code = `<?php
$users = DB::table('users')->whereRaw('votes > ' . $threshold)->get();
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should fire on ->selectRaw with string concatenation', () => {
			const code = `<?php
$users = DB::table('users')->selectRaw('count(*) as total' . $extra)->get();
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should fire on ->orderByRaw with string concatenation', () => {
			const code = `<?php
$users = DB::table('users')->orderByRaw('created_at ' . $direction)->get();
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should fire on ->havingRaw with string concatenation', () => {
			const code = `<?php
$users = DB::table('users')->groupBy('status')->havingRaw('count(*) ' . $op . $count)->get();
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should NOT fire on parameterized raw SQL with bindings', () => {
			const code = `<?php
$users = DB::table('users')->whereRaw('votes > ?', [$votes])->get();
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBe(0);
		});

		it('should NOT fire on DB::raw with static string only', () => {
			const code = `<?php
$users = DB::table('users')->whereRaw('votes > 100')->get();
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBe(0);
		});
	});

	describe('sast/php-laravel-mass-assignment', () => {
		const ruleId = 'sast/php-laravel-mass-assignment';

		it('should fire on protected $guarded = []', () => {
			const code = `<?php
class User extends Model {
    protected $guarded = [];
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should fire on public $guarded = []', () => {
			const code = `<?php
class User extends Model {
    public $guarded = [];
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should NOT fire on $fillable', () => {
			const code = `<?php
class User extends Model {
    protected $fillable = ['name', 'email'];
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBe(0);
		});

		it('should NOT fire on $guarded with values', () => {
			const code = `<?php
class User extends Model {
    protected $guarded = ['id', 'password'];
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBe(0);
		});
	});

	describe('sast/php-laravel-destructive-migration', () => {
		const ruleId = 'sast/php-laravel-destructive-migration';

		it('should fire on Schema::dropIfExists without down()', () => {
			const code = `<?php
use IlluminateDatabaseMigrationsMigration;

class DropUsersTable extends Migration {
    public function up() {
        Schema::dropIfExists('users');
    }
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should fire on Schema::drop without down()', () => {
			const code = `<?php
use IlluminateDatabaseMigrationsMigration;

class DropUsersTable extends Migration {
    public function up() {
        Schema::drop('users');
    }
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should fire on ->dropColumn without down()', () => {
			const code = `<?php
use IlluminateDatabaseMigrationsMigration;

class RemoveEmailColumn extends Migration {
    public function up() {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('email');
        });
    }
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBeGreaterThan(0);
		});

		it('should NOT fire on Schema::dropIfExists with down()', () => {
			const code = `<?php
use IlluminateDatabaseMigrationsMigration;

class DropUsersTable extends Migration {
    public function up() {
        Schema::dropIfExists('users');
    }

    public function down() {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
        });
    }
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBe(0);
		});

		it('should NOT fire on dropColumn with down()', () => {
			const code = `<?php
use IlluminateDatabaseMigrationsMigration;

class RemoveEmailColumn extends Migration {
    public function up() {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('email');
        });
    }

    public function down() {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email');
        });
    }
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBe(0);
		});

		it('should NOT fire when no destructive operations present', () => {
			const code = `<?php
use IlluminateDatabaseMigrationsMigration;

class CreateUsersTable extends Migration {
    public function up() {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
        });
    }

    public function down() {
        Schema::dropIfExists('users');
    }
}
`;
			const findings = executeRulesSync('test.php', code, 'php');
			const matching = findings.filter((f) => f.rule_id === ruleId);
			expect(matching.length).toBe(0);
		});
	});
});
