const STATUS_TRANSITIONS = {
  SUBMITTED: ["UNDER_REVIEW"],

  UNDER_REVIEW: [
    "ASSIGNED",
    "NEEDS_INFORMATION",
    "REJECTED",
    "DUPLICATE_SUSPECTED",
  ],

  ASSIGNED: [
    "IN_PROGRESS",
    "NEEDS_INFORMATION",
  ],

  IN_PROGRESS: [
    "RESOLVED",
    "NEEDS_INFORMATION",
  ],

  NEEDS_INFORMATION: [
    "UNDER_REVIEW",
    "ASSIGNED",
  ],

  DUPLICATE_SUSPECTED: [
    "REJECTED",
    "UNDER_REVIEW",
  ],

  RESOLVED: [],
  REJECTED: [],
};

function canTransition(currentStatus, newStatus) {
  return STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

module.exports = {
  STATUS_TRANSITIONS,
  canTransition,
};