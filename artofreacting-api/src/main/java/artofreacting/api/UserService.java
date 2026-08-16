package artofreacting.api;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class UserService {
    private final UserRepository repository;

    public UserService(UserRepository repository) {
        this.repository = repository;
    }

    public User register(String username) {
        User user = new User(UUID.randomUUID(), username, Instant.now());
        
        if (!repository.saveIfAbsent(user)) {
            throw new UsernameAlreadyExistsException(username);
        }
 
        return user;
    }

    public List<User> list() {
        return repository.findAll();
    }
}