package artofreacting.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = {UserController.class, GlobalExceptionHandler.class})
class UserControllerTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @MockBean
    UserService service;

    @Test
    void post_registersUserAndReturnsCreated() throws Exception {
        UUID id = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        Instant createdAt = Instant.parse("2026-08-16T10:15:30Z");
        when(service.register("dejan")).thenReturn(new User(id, "dejan", createdAt));

        mvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"dejan\"}"))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.username").value("dejan"))
                .andExpect(jsonPath("$.createdAt").value("2026-08-16T10:15:30Z"));
    }

    @Test
    void post_trimsSurroundingWhitespaceBeforeValidatingAndPersisting() throws Exception {
        when(service.register("dejan")).thenReturn(new User(UUID.randomUUID(), "dejan", Instant.now()));

        mvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"   dejan   \"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("dejan"));

        verify(service).register("dejan");
    }

    @Test
    void post_rejectsBlankUsername() throws Exception {
        mvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("Username must contain between 3 and 50 characters"));
    }

    @Test
    void post_rejectsMissingUsernameField() throws Exception {
        mvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    @Test
    void post_rejectsUsernameShorterThanMinimum() throws Exception {
        mvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"ab\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("Username must contain between 3 and 50 characters"));
    }

    @Test
    void post_rejectsUsernameLongerThanMaximum() throws Exception {
        String tooLong = "x".repeat(51);
        mvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + tooLong + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("Username must contain between 3 and 50 characters"));
    }

    @Test
    void post_rejectsMalformedJson() throws Exception {
        mvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not-json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
    }

    @Test
    void post_returnsConflictWhenUsernameAlreadyRegistered() throws Exception {
        doThrow(new UsernameAlreadyExistsException("dejan"))
                .when(service).register(eq("dejan"));

        mvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"dejan\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("USERNAME_TAKEN"))
                .andExpect(jsonPath("$.message").value("Username is already registered"));
    }

    @Test
    void get_returnsEmptyListWhenNoUsersRegistered() throws Exception {
        when(service.list()).thenReturn(List.of());

        mvc.perform(get("/api/users"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void get_returnsAllRegisteredUsers() throws Exception {
        User alice = new User(UUID.randomUUID(), "alice", Instant.parse("2026-08-16T10:00:00Z"));
        User bob = new User(UUID.randomUUID(), "bob", Instant.parse("2026-08-16T10:05:00Z"));
        when(service.list()).thenReturn(List.of(alice, bob));

        mvc.perform(get("/api/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].username").value("alice"))
                .andExpect(jsonPath("$[1].username").value("bob"));
    }
}
