package com.example.demo;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
public class TestDB {
    public static void main(String[] args) throws Exception {
        String username = System.getenv("MYSQL_USER");
        String password = System.getenv("MYSQL_PASSWORD");
        if (username == null || username.isBlank() || password == null) {
            throw new IllegalStateException("Set MYSQL_USER and MYSQL_PASSWORD before running this database check.");
        }
        String host = System.getenv().getOrDefault("MYSQL_HOST", "127.0.0.1");
        String port = System.getenv().getOrDefault("MYSQL_PORT", "3306");
        String database = System.getenv().getOrDefault("MYSQL_DATABASE", "skybook");
        Connection conn = DriverManager.getConnection(
                "jdbc:mysql://" + host + ":" + port + "/" + database, username, password);
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery("DESCRIBE bookings");
        while(rs.next()) {
            System.out.println(rs.getString("Field") + " " + rs.getString("Type"));
        }
        conn.close();
    }
}
