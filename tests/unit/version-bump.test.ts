import { describe, it, expect } from 'bun:test'
import pkg from '../../package.json'

describe('Version Bump Verification', () => {
  it('should have version set to 6.31.3', () => {
    expect(pkg.version).toBe('6.31.3')
  })

  it('should match semver format 6.31.3', () => {
    const semverRegex = /^\d+\.\d+\.\d+$/
    expect(pkg.version).toMatch(semverRegex)
    expect(pkg.version).toBe('6.31.3')
  })
})
