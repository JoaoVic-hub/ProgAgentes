<!-- Sync Impact Report
Version change: initial creation (1.0.0)
Modified principles: none (new constitution)
Added sections: Core Principles, Technology Stack, Development Workflow, Governance
Removed sections: none
Follow-up TODOs: none
-->
# Game Development Project Constitution

## Core Principles

### I. Simplicity and Readability
Prioritize simple and readable code before premature optimizations. Maintain organized structure with clear separation between gameplay logic, UI, and data to allow project evolution without rewriting.

### II. Selective Testing
Automated tests are mandatory only for critical logic: collision detection, scoring/lives calculation, and save persistence. UI logic, animations, and visual adjustments do not require formal tests.

### III. Cross-Platform Compatibility
The game must run with the same codebase on both web and mobile (Android/iOS via native packaging). Avoid dependencies or APIs that only work in one environment. Performance must be fluid on entry-level devices, not just desktop.

### IV. Minimal Dependencies
Prefer few well-maintained external dependencies over many small libraries. Evaluate each dependency for maintenance status, community support, and cross-platform compatibility.

### V. Maintainability and Readability
Code must be readable enough to resume the project after weeks of inactivity. Use consistent naming, clear comments where necessary, and avoid overly clever constructs that hinder understanding.

## Technology Stack

The project will use a web-based framework that supports cross-platform compilation to native mobile apps. Ensure all chosen libraries and tools meet the cross-platform requirement and are actively maintained.

## Development Workflow

Development should follow iterative prototyping with regular code reviews. Prioritize learning best practices while maintaining rapid prototyping pace. Document key decisions and architectural choices.

## Governance

This constitution is the guiding document for the project. All development decisions must comply with its principles. Amendments require documentation, discussion, and approval by project maintainers. Regular reviews should ensure alignment with the constitution.

**Version**: 1.0.0 | **Ratified**: 2026-09-10 | **Last Amended**: 2026-09-10