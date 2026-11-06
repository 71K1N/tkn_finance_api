export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-case": [2, "always", "kebab-case"],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
