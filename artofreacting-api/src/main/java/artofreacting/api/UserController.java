package artofreacting.api;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/users")
class UserController {
    private final UserService service;

    UserController(UserService service) {
        this.service = service;
    }

    @PostMapping
    ResponseEntity<User> register(@Valid @RequestBody CreateUserRequest request) {
        User created = service.register(request.username());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    List<User> list() {
        return service.list();
    }
}
