import type { SMEDomainConfig } from './base';

export const uiUxSMEConfig: SMEDomainConfig = {
	domain: 'ui_ux',
	description: 'UI/UX design, interaction patterns, and visual systems',
	guidance: `For UI/UX tasks, provide:
- Information architecture and navigation flow
- Interaction patterns and states (loading, empty, error, success)
- Responsive layout guidance and breakpoints
- Typography scale and hierarchy recommendations
- Spacing system (8px grid, consistent margins/padding)
- Color usage (primary, secondary, semantic colors)
- Contrast and accessibility requirements (WCAG 2.1 AA)
- Component structure and reusability patterns
- Form design best practices (labels, validation, feedback)
- Motion/animation guidance (purposeful, not excessive)
- Touch target sizes for mobile (44px minimum)
- Focus management for keyboard navigation
- Icon usage and consistency
- Empty states and error message design
- Progressive disclosure patterns
- Loading and skeleton states`,
};
