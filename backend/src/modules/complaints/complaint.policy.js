const { ROLES } = require("../../domain/roles");

function canReadComplaint(user, complaint) {
  if (user.role === ROLES.OFFICER || user.role === ROLES.ADMIN) {
    return true;
  }

  if (
    user.role === ROLES.CITIZEN &&
    String(complaint.citizen_id) === String(user.id)
  ) {
    return true;
  }

  return false;
}

function canModifyComplaintEvidence(user, complaint) {
  if (user.role === ROLES.OFFICER || user.role === ROLES.ADMIN) {
    return true;
  }

  if (
    user.role === ROLES.CITIZEN &&
    String(complaint.citizen_id) === String(user.id)
  ) {
    return true;
  }

  return false;
}

module.exports = {
  canReadComplaint,
  canModifyComplaintEvidence,
};
