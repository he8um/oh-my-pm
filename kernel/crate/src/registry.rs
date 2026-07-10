//! Version registry checks.

use std::collections::BTreeSet;

use crate::contracts::kernel::{ComponentId, ValidationFinding, VersionRegistryManifest};
use crate::errors::{
    blocking_finding, OMP_K_DUPLICATE_COMPONENT, OMP_K_INVALID_PAYLOAD, OMP_K_MISSING_COMPONENT,
};

/// Wire name of a component identifier.
fn component_id_key(id: &ComponentId) -> &'static str {
    match id {
        ComponentId::Contracts => "contracts",
        ComponentId::Kernel => "kernel",
        ComponentId::Runtime => "runtime",
        ComponentId::Planner => "planner",
        ComponentId::Providers => "providers",
        ComponentId::Skills => "skills",
        ComponentId::Cli => "cli",
        ComponentId::Installer => "installer",
        ComponentId::Validation => "validation",
    }
}

/// Components that every valid registry must contain.
pub fn required_components() -> Vec<ComponentId> {
    vec![
        ComponentId::Contracts,
        ComponentId::Kernel,
        ComponentId::Runtime,
        ComponentId::Planner,
        ComponentId::Providers,
        ComponentId::Skills,
        ComponentId::Cli,
        ComponentId::Installer,
        ComponentId::Validation,
    ]
}

/// Check a version registry manifest and return every finding.
pub fn validate_version_registry(manifest: &VersionRegistryManifest) -> Vec<ValidationFinding> {
    let mut findings = Vec::new();

    if manifest.schema_version.is_empty() {
        findings.push(blocking_finding(
            OMP_K_INVALID_PAYLOAD,
            "schemaVersion must not be empty",
            "/schemaVersion",
        ));
    }
    if manifest.system_version.is_empty() {
        findings.push(blocking_finding(
            OMP_K_INVALID_PAYLOAD,
            "systemVersion must not be empty",
            "/systemVersion",
        ));
    }

    let mut seen = BTreeSet::new();
    for (index, component) in manifest.components.iter().enumerate() {
        let key = component_id_key(&component.id);
        if component.version.is_empty() {
            findings.push(blocking_finding(
                OMP_K_INVALID_PAYLOAD,
                format!("component {key} has an empty version"),
                format!("/components/{index}/version"),
            ));
        }
        if !seen.insert(key) {
            findings.push(blocking_finding(
                OMP_K_DUPLICATE_COMPONENT,
                format!("duplicate component id {key}"),
                format!("/components/{index}/id"),
            ));
        }
    }

    for required in required_components() {
        let key = component_id_key(&required);
        if !seen.contains(key) {
            findings.push(blocking_finding(
                OMP_K_MISSING_COMPONENT,
                format!("required component {key} is missing"),
                "/components",
            ));
        }
    }

    findings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contracts::kernel::{ComponentVersion, ReleaseState};

    fn manifest_with(components: Vec<ComponentVersion>) -> VersionRegistryManifest {
        VersionRegistryManifest {
            schema_version: "1".to_string(),
            system_version: "2.0.0-alpha.0".to_string(),
            components,
        }
    }

    fn complete_components() -> Vec<ComponentVersion> {
        required_components()
            .into_iter()
            .map(|id| ComponentVersion {
                id,
                version: "2.0.0-alpha.0".to_string(),
                state: ReleaseState::Source,
            })
            .collect()
    }

    #[test]
    fn complete_manifest_has_no_findings() {
        assert!(validate_version_registry(&manifest_with(complete_components())).is_empty());
    }

    #[test]
    fn duplicate_component_is_reported_once() {
        let mut components = complete_components();
        components.push(components[0].clone());
        let findings = validate_version_registry(&manifest_with(components));
        let duplicates: Vec<_> = findings
            .iter()
            .filter(|f| f.code == OMP_K_DUPLICATE_COMPONENT)
            .collect();
        assert_eq!(duplicates.len(), 1);
    }

    #[test]
    fn missing_component_is_reported() {
        let components: Vec<_> = complete_components()
            .into_iter()
            .filter(|c| c.id != ComponentId::Skills)
            .collect();
        let findings = validate_version_registry(&manifest_with(components));
        assert!(findings
            .iter()
            .any(|f| f.code == OMP_K_MISSING_COMPONENT && f.message.contains("skills")));
    }

    #[test]
    fn empty_version_fields_are_reported() {
        let mut manifest = manifest_with(complete_components());
        manifest.schema_version = String::new();
        manifest.system_version = String::new();
        manifest.components[0].version = String::new();
        let findings = validate_version_registry(&manifest);
        assert_eq!(
            findings.iter().filter(|f| f.code == OMP_K_INVALID_PAYLOAD).count(),
            3
        );
    }
}
