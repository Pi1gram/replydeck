import { missingScopes, RESOURCE_SCOPES } from "../src/microsoft/scope-utils";

describe("missingScopes", () => {
  it("flags Calendars.Read missing for a pre-calendar grant (short names)", () => {
    const granted = ["openid", "User.Read", "Mail.Read", "Mail.Send"];
    expect(missingScopes(granted)).toEqual(["Calendars.Read"]);
  });

  it("returns empty when all required scopes are present", () => {
    const granted = [
      "User.Read",
      "Mail.Read",
      "Mail.Send",
      "Calendars.Read"
    ];
    expect(missingScopes(granted)).toEqual([]);
  });

  it("matches full Graph resource URIs case-insensitively", () => {
    const granted = [
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/mail.read",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/Calendars.Read"
    ];
    expect(missingScopes(granted)).toEqual([]);
  });

  it("treats an empty grant as missing everything", () => {
    expect(missingScopes([])).toEqual(RESOURCE_SCOPES);
  });
});
