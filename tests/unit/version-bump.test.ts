import { describe, it, expect } from 'vitest'
import pkg from '../../package.json'

describe('Version Bump Verification', () => {
  it('should have version set to 6.22.19', () => {
    expect(pkg.version).toBe('6.22.19')
  })

  it('should match semver format 6.22.19', () => {
    const semverRegex = /^\d+\.\d+\.\d+$/
    expect(pkg.version).toMatch(semverRegex)
    expect(pkg.version).toBe('6.22.19')
  })
})
