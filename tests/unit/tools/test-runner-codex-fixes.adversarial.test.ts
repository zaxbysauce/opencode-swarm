import { describe, expect, test } from 'bun:test';
import { isLanguageSpecificTestFile } from '../../../src/tools/test-runner';

// ============================================================
// isLanguageSpecificTestFile — Java detection adversarial tests
// Tests the Java naming convention detection for adversarial inputs
// Note: Implementation uses endsWith patterns, not strict prefix/suffix matching
// ============================================================
describe('isLanguageSpecificTestFile — Java detection adversarial', () => {
	// Java convention: *Test.java, *Tests.java, Test*.java, *IT.java
	// The implementation uses endsWith checks which match edge cases like 'myit.java'

	test('path traversal basename: Test.java (from ../../Test.java) — should be valid', () => {
		// path.basename('../../Test.java') returns 'Test.java' on both Unix/Windows
		// Test.java is a VALID Java test file name
		const result = isLanguageSpecificTestFile('Test.java');
		expect(result).toBe(true);
	});

	test('all caps basename: FOOTEST.java — returns false', () => {
		// FOOTEST doesn't match ^Test[A-Z] (needs to START with 'Test' followed by uppercase)
		// And doesn't end with 'Test.java' or 'Tests.java'
		const result = isLanguageSpecificTestFile('FOOTEST.java');
		expect(result).toBe(false);
	});

	test('all lower basename: footest.java — returns false', () => {
		// footest doesn't match any Java pattern
		const result = isLanguageSpecificTestFile('footest.java');
		expect(result).toBe(false);
	});

	test('double extension: Test.java.java — returns false', () => {
		// basename is 'Test.java.java'
		// - lower.endsWith('.java') = true
		// - /^Test[A-Z]/.test('Test.java.java') = false (char after 'Test' is '.')
		const result = isLanguageSpecificTestFile('Test.java.java');
		expect(result).toBe(false);
	});

	test('empty string — does not crash, returns false', () => {
		const result = isLanguageSpecificTestFile('');
		expect(result).toBe(false);
	});

	test('very long filename (1000+ chars) — does not crash', () => {
		const longName = 'T' + 'e'.repeat(998) + 'st.java';
		const result = isLanguageSpecificTestFile(longName);
		// Doesn't match ^Test[A-Z] (T followed by lowercase e)
		expect(result).toBe(false);
	});

	test('exactly 1000 char filename starting with Test: TestAAAA...AAA.java', () => {
		// Valid pattern: Test + uppercase A + rest
		const longName = 'Test' + 'A'.repeat(994) + '.java';
		const result = isLanguageSpecificTestFile(longName);
		expect(result).toBe(true);
	});

	test('unicode in basename: TëstFoo.java — returns false', () => {
		// tëstfoo doesn't start with 'Test' (ë is not 'e')
		const result = isLanguageSpecificTestFile('TëstFoo.java');
		expect(result).toBe(false);
	});

	test('unicode that still matches: TestTëst.java — returns true', () => {
		// TestTëst.java starts with 'Test' followed by 'T' (uppercase)
		const result = isLanguageSpecificTestFile('TestTëst.java');
		expect(result).toBe(true);
	});

	test('bare Test.java — returns true', () => {
		const result = isLanguageSpecificTestFile('Test.java');
		expect(result).toBe(true);
	});

	test('MyTest.java — returns true', () => {
		const result = isLanguageSpecificTestFile('MyTest.java');
		expect(result).toBe(true);
	});

	test('MyTests.java (plural) — returns true', () => {
		const result = isLanguageSpecificTestFile('MyTests.java');
		expect(result).toBe(true);
	});

	test('MyIT.java (integration test) — returns true', () => {
		const result = isLanguageSpecificTestFile('MyIT.java');
		expect(result).toBe(true);
	});

	test('lowercase it.java suffix: myit.java — returns true', () => {
		// Implementation uses lower.endsWith('it.java')
		// 'myit.java'.endsWith('it.java') = true
		const result = isLanguageSpecificTestFile('myit.java');
		expect(result).toBe(true);
	});

	test('Protest.java (contains test) — returns false', () => {
		// protest doesn't match any Java pattern
		const result = isLanguageSpecificTestFile('Protest.java');
		expect(result).toBe(false);
	});

	test('Test123.java (digits after Test) — returns false', () => {
		// char after 'Test' is '1' (digit), not uppercase letter
		const result = isLanguageSpecificTestFile('Test123.java');
		expect(result).toBe(false);
	});

	test('Test_underscore.java — returns false', () => {
		// char after 'Test' is '_' (not uppercase letter)
		const result = isLanguageSpecificTestFile('Test_underscore.java');
		expect(result).toBe(false);
	});

	test('null character in name — does not crash', () => {
		const result = isLanguageSpecificTestFile('Test\x00.java');
		expect(result).toBe(false);
	});

	test('tab character in name — does not crash', () => {
		const result = isLanguageSpecificTestFile('Test\t.java');
		expect(result).toBe(false);
	});

	test('newline in name — does not crash', () => {
		const result = isLanguageSpecificTestFile('Test\n.java');
		expect(result).toBe(false);
	});
});

// ============================================================
// isLanguageSpecificTestFile — Kotlin adversarial tests
// ============================================================
describe('isLanguageSpecificTestFile — Kotlin detection adversarial', () => {
	test('footest.kt — returns true (ends with test.kt)', () => {
		// Implementation: lower.endsWith('test.kt')
		// 'footest.kt'.endsWith('test.kt') = true (footest ends with test)
		const result = isLanguageSpecificTestFile('footest.kt');
		expect(result).toBe(true);
	});

	test('FOOTEST.KT — returns true (case insensitive)', () => {
		const result = isLanguageSpecificTestFile('FOOTEST.KT');
		expect(result).toBe(true);
	});

	test('Test.kt — returns true', () => {
		const result = isLanguageSpecificTestFile('Test.kt');
		expect(result).toBe(true);
	});

	test('TestTests.kt — returns true (ends with Tests.kt)', () => {
		const result = isLanguageSpecificTestFile('TestTests.kt');
		expect(result).toBe(true);
	});

	test('test.kt (lowercase) — returns true', () => {
		// 'test.kt'.endsWith('test.kt') = true
		const result = isLanguageSpecificTestFile('test.kt');
		expect(result).toBe(true);
	});

	test('tests.kt (plural lowercase) — returns true', () => {
		const result = isLanguageSpecificTestFile('tests.kt');
		expect(result).toBe(true);
	});

	test('TestKotlin.kt — returns true', () => {
		// Kotlin: ^Test[A-Z] matches 'TestKotlin'
		const result = isLanguageSpecificTestFile('TestKotlin.kt');
		expect(result).toBe(true);
	});

	test('testutil.kt — returns false (ends with util.kt, not test.kt)', () => {
		// 'testutil.kt'.endsWith('test.kt') = false
		const result = isLanguageSpecificTestFile('testutil.kt');
		expect(result).toBe(false);
	});

	test('testing.kt — returns false', () => {
		const result = isLanguageSpecificTestFile('testing.kt');
		expect(result).toBe(false);
	});
});

// ============================================================
// isLanguageSpecificTestFile — Python adversarial tests
// ============================================================
describe('isLanguageSpecificTestFile — Python detection adversarial', () => {
	test('test_Foo.py (valid) — returns true', () => {
		// Python: lower.startsWith('test_') OR lower.endsWith('_test.py')
		const result = isLanguageSpecificTestFile('test_Foo.py');
		expect(result).toBe(true);
	});

	test('Foo_test.py (valid) — returns true', () => {
		const result = isLanguageSpecificTestFile('Foo_test.py');
		expect(result).toBe(true);
	});

	test('FooTest.py (no underscore) — returns false', () => {
		// No 'test_' prefix, doesn't end with '_test.py'
		const result = isLanguageSpecificTestFile('FooTest.py');
		expect(result).toBe(false);
	});

	test('test.py (bare) — returns false', () => {
		// 'test.py'.startsWith('test_') = false
		// 'test.py'.endsWith('_test.py') = false
		const result = isLanguageSpecificTestFile('test.py');
		expect(result).toBe(false);
	});

	test('_test.py (leading underscore) — returns true', () => {
		// '_test.py'.endsWith('_test.py') = true
		const result = isLanguageSpecificTestFile('_test.py');
		expect(result).toBe(true);
	});

	test('__init__.py — returns false', () => {
		const result = isLanguageSpecificTestFile('__init__.py');
		expect(result).toBe(false);
	});
});

// ============================================================
// isLanguageSpecificTestFile — Go adversarial tests
// ============================================================
describe('isLanguageSpecificTestFile — Go detection adversarial', () => {
	test('Foo_test.go (valid) — returns true', () => {
		const result = isLanguageSpecificTestFile('Foo_test.go');
		expect(result).toBe(true);
	});

	test('foo_test.go (lowercase) — returns true', () => {
		const result = isLanguageSpecificTestFile('foo_test.go');
		expect(result).toBe(true);
	});

	test('FooTest.go (wrong pattern) — returns false', () => {
		// Doesn't end with '_test.go'
		const result = isLanguageSpecificTestFile('FooTest.go');
		expect(result).toBe(false);
	});

	test('_test.go (bare) — returns true', () => {
		const result = isLanguageSpecificTestFile('_test.go');
		expect(result).toBe(true);
	});
});

// ============================================================
// isLanguageSpecificTestFile — Ruby adversarial tests
// ============================================================
describe('isLanguageSpecificTestFile — Ruby detection adversarial', () => {
	test('Foo_spec.rb (valid RSpec) — returns true', () => {
		const result = isLanguageSpecificTestFile('Foo_spec.rb');
		expect(result).toBe(true);
	});

	test('foo_spec.rb (lowercase) — returns true', () => {
		const result = isLanguageSpecificTestFile('foo_spec.rb');
		expect(result).toBe(true);
	});

	test('Foo_test.rb (wrong pattern) — returns false', () => {
		// Ruby uses _spec.rb, not _test.rb
		const result = isLanguageSpecificTestFile('Foo_test.rb');
		expect(result).toBe(false);
	});

	test('Foo_spec.rb.rb (double ext) — returns false', () => {
		const result = isLanguageSpecificTestFile('Foo_spec.rb.rb');
		expect(result).toBe(false);
	});
});

// ============================================================
// isLanguageSpecificTestFile — PowerShell adversarial tests
// ============================================================
describe('isLanguageSpecificTestFile — PowerShell detection adversarial', () => {
	test('MyModule.Tests.ps1 (valid) — returns true', () => {
		const result = isLanguageSpecificTestFile('MyModule.Tests.ps1');
		expect(result).toBe(true);
	});

	test('mymodule.tests.ps1 (lowercase) — returns true', () => {
		const result = isLanguageSpecificTestFile('mymodule.tests.ps1');
		expect(result).toBe(true);
	});

	test('MyModule.Test.ps1 (singular Tests) — returns false', () => {
		// Requires '.tests.ps1' (plural)
		const result = isLanguageSpecificTestFile('MyModule.Test.ps1');
		expect(result).toBe(false);
	});
});

// ============================================================
// isLanguageSpecificTestFile — C# adversarial tests
// ============================================================
describe('isLanguageSpecificTestFile — C# detection adversarial', () => {
	test('FooTest.cs (valid) — returns true', () => {
		const result = isLanguageSpecificTestFile('FooTest.cs');
		expect(result).toBe(true);
	});

	test('FooTests.cs (plural) — returns true', () => {
		const result = isLanguageSpecificTestFile('FooTests.cs');
		expect(result).toBe(true);
	});

	test('footest.cs — returns true (ends with test.cs)', () => {
		// Implementation: lower.endsWith('test.cs')
		// 'footest.cs'.endsWith('test.cs') = true
		const result = isLanguageSpecificTestFile('footest.cs');
		expect(result).toBe(true);
	});

	test('FOOTEST.cs — returns true (case insensitive)', () => {
		const result = isLanguageSpecificTestFile('FOOTEST.cs');
		expect(result).toBe(true);
	});

	test('Foo.cs (source) — returns false', () => {
		const result = isLanguageSpecificTestFile('Foo.cs');
		expect(result).toBe(false);
	});
});

// ============================================================
// Security boundary: isLanguageSpecificTestFile should NOT crash on any input
// ============================================================
describe('isLanguageSpecificTestFile — security boundary: no crashes on any input', () => {
	const maliciousInputs = [
		// Path traversal attempts (though basename() handles these)
		'../../etc/passwd',
		'..\\..\\windows\\system32',
		// Shell metacharacters
		'|cat',
		'&&whoami',
		';rm -rf',
		'`whoami`',
		'$(whoami)',
		// Special characters
		'\x00',
		'\n',
		'\r',
		'\t',
		'\x1f',
		// Unicode edge cases
		'\u0000',
		'\uFFFF',
		'\uD800',
		'\uDC00',
		// Very long strings
		'A'.repeat(10000),
		// Emoji
		'Test👍.java',
		// Right-to-left override
		'\u202ETest.java',
		// Null byte combined
		'T\x00est.java',
	];

	test.each(maliciousInputs)('input "%s" does not crash', (input) => {
		expect(() => isLanguageSpecificTestFile(input)).not.toThrow();
	});

	test.each(maliciousInputs)('input "%s" returns a boolean', (input) => {
		const result = isLanguageSpecificTestFile(input);
		expect(typeof result).toBe('boolean');
	});
});
