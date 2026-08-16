package artofreacting.api;

import java.util.List;

public interface UserRepository {
    /**
     * Atomically saves the user if the (case-insensitive) username is not already
     * registered. Returns true on success, false if the username was already taken.
     */
    boolean saveIfAbsent(User user);

    List<User> findAll();
}
