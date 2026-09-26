// These fixtures and rules illustrate a policy model. They enforce no real access.
export const identities = [
  { id: 'user_01', name: 'Mara Chen', role: 'customer', workspace: 'w_studio', customer: 'c_alder', initials: 'MC' },
  { id: 'user_02', name: 'Theo Park', role: 'teammate', workspace: 'w_studio', initials: 'TP' },
  { id: 'user_03', name: 'Jules Rivera', role: 'contractor', workspace: 'w_studio', initials: 'JR' },
  { id: 'user_04', name: 'Nico Bell', role: 'administrator', workspace: 'w_studio', initials: 'NB' },
];

export const projects = [
  { id: 'proj_01', name: 'Website launch', customer: 'c_alder', customerName: 'Alder Studio', workspace: 'w_studio', assigned: ['user_02', 'user_03'], shared: true, archived: false, stage: 'In progress' },
  { id: 'proj_02', name: 'Client portal', customer: 'c_bloom', customerName: 'Bloom Works', workspace: 'w_studio', assigned: ['user_03'], shared: false, archived: false, stage: 'In review' },
  { id: 'proj_03', name: 'Brand refresh', customer: 'c_alder', customerName: 'Alder Studio', workspace: 'w_studio', assigned: ['user_02'], shared: true, archived: false, stage: 'Planning' },
  { id: 'proj_04', name: 'Research archive', customer: 'c_alder', customerName: 'Alder Studio', workspace: 'w_studio', assigned: ['user_03'], shared: true, archived: true, stage: 'Archived' },
  { id: 'proj_05', name: 'Operations board', customer: 'c_internal', customerName: 'Internal', workspace: 'w_studio', assigned: ['user_02'], shared: false, archived: false, stage: 'In progress' },
  { id: 'proj_06', name: 'Field study', customer: 'c_alder', customerName: 'Alder Studio', workspace: 'w_other', assigned: ['user_03'], shared: true, archived: false, stage: 'Planning' },
];

export const variants = [
  { id: 'assigned', name: 'Assigned only', rule: 'membership + assignment', description: 'Contractors read and update active projects they are assigned to, within their workspace.' },
  { id: 'workspace', name: 'Workspace-wide', rule: 'membership', description: 'Contractors read every active project in their workspace. Updates still require an assignment.' },
  { id: 'readonly', name: 'Assigned, read-only', rule: 'membership + assignment; no writes', description: 'Contractors read assigned active projects in their workspace. All updates are denied.' },
];

export const assumptions = 'Fictional fixtures; one workspace per identity. Workspace membership is always required. Archived projects are administrator-only. Customers read only their own shared projects. Teammates read and update active workspace projects. Only administrators delete. Contractor variants affect contractors only. No real authentication or database enforcement.';

export function decide(identity, project, variant = 'assigned', action = 'read') {
  const result = (allowed, reason) => ({ allowed, reason });
  if (!identity || !project || !['read', 'update', 'delete'].includes(action) || !variants.some(v => v.id === variant)) return result(false, 'Unknown identity, record, action, or policy. Denied by default.');
  if (!['customer', 'teammate', 'contractor', 'administrator'].includes(identity.role)) return result(false, 'Unknown role. Denied by default.');
  if (!identity.workspace || identity.workspace !== project.workspace) return result(false, 'Workspace mismatch. Even an assignment cannot cross a workspace boundary.');
  if (identity.role === 'administrator') return result(true, 'Administrator in this workspace. All project actions are allowed, including archived records.');
  if (project.archived) return result(false, 'This project is archived. Only workspace administrators can access archived projects.');
  if (action === 'delete') return result(false, 'Deleting projects is restricted to workspace administrators.');
  if (identity.role === 'customer') {
    if (!identity.customer || project.customer !== identity.customer) return result(false, 'This project belongs to another customer.');
    if (!project.shared) return result(false, 'This project has not been shared with the customer.');
    return result(action === 'read', action === 'read' ? 'Your customer account matches this shared, active project.' : 'Customer access is read-only, even on a shared project.');
  }
  if (identity.role === 'teammate') return result(true, 'Teammate in this workspace. Reading and updating active projects are allowed.');
  const assigned = project.assigned.includes(identity.id);
  if (action === 'read' && variant === 'workspace') return result(true, 'Workspace-wide preview: contractors may read every active project in their workspace.');
  if (!assigned) return result(false, 'Your identity is not in this project’s assignments.');
  if (action === 'update' && variant === 'readonly') return result(false, 'The selected contractor policy allows reading only.');
  return result(true, 'Workspace matches and your identity is assigned to this active project.');
}

export function scenarioContext({ identityId, projectId, variantId, topic = 'record' }) {
  const identity = identities.find(i => i.id === identityId) ?? identities[2];
  const project = projects.find(p => p.id === projectId) ?? projects[0];
  const variant = variants.find(v => v.id === variantId) ?? variants[0];
  return {
    sandbox: 'Rowhaven / project management / illustrative local policy preview',
    discussion: topic === 'policy' ? 'contractor policy' : 'selected project record',
    identity, selectedRecord: project, contractorPolicy: variant,
    decisions: Object.fromEntries(['read', 'update', 'delete'].map(action => [action, decide(identity, project, variant.id, action)])),
    visibleRecords: projects.filter(p => decide(identity, p, variant.id).allowed).map(p => p.id),
    assumptions,
  };
}
