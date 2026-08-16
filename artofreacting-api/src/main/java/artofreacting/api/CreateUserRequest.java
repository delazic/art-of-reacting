package artofreacting.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank(message = "Username must contain between 3 and 50 characters")
        @Size(min = 3, max = 50, message = "Username must contain between 3 and 50 characters")
        String username) {
    public CreateUserRequest {
        username = username == null ? null : username.trim();
    }
}
