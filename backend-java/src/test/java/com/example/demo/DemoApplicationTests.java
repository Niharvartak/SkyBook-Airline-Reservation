package com.example.demo;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

@SpringBootTest
class DemoApplicationTests {

    @Autowired
    private DataSource dataSource;

    @Test
    void testDb() throws Exception {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            
            // Create users table if it doesn't exist since ddl-auto=none
            stmt.executeUpdate("CREATE TABLE IF NOT EXISTS users (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY," +
                "name VARCHAR(255) NOT NULL," +
                "email VARCHAR(255) NOT NULL UNIQUE," +
                "password VARCHAR(255) NOT NULL," +
                "role VARCHAR(50) DEFAULT 'USER'" +
                ")");
            
            ResultSet rs = stmt.executeQuery("DESCRIBE users");
            System.out.println("---- USERS SCHEMA ----");
            while (rs.next()) {
                System.out.println(rs.getString("Field") + " " + rs.getString("Type"));
            }
            System.out.println("-------------------------");
        }
    }

	@Test
	void contextLoads() {
	}

}

