import asyncio, json
from app.services.local_executor import LocalCodeExecutor

src = '''import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}
'''
res = LocalCodeExecutor.execute(source_code=src, language="java", stdin="3 4\n", expected_output="7\n")
print(json.dumps(res, indent=2)[:2000])
