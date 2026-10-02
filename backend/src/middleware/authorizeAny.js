const { ROLE_PERMISSIONS } = require("../domain/roles");

function authorizeAny(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      });
    }

    const permissions = ROLE_PERMISSIONS[req.user.role] || [];

    const hasPermission = requiredPermissions.some(
      (permission) => permissions.includes(permission),
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action",
        },
      });
    }

    next();
  };
}

module.exports = authorizeAny;