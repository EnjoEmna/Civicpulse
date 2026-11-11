const { z } = require("zod");

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100),
});

module.exports = {
  changePasswordSchema,
};
